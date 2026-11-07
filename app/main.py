import json, os, re, uuid
from pathlib import Path
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
try:
    from neo4j import GraphDatabase
    from openai import OpenAI
except ImportError:
    GraphDatabase=OpenAI=None

UPLOADS=Path(os.getenv("UPLOAD_DIR","./uploads")); UPLOADS.mkdir(parents=True,exist_ok=True)
app=FastAPI(title="Supply Chain Risk Explorer",description="Supply-chain entity and relationship research grounded in source documents")
def driver():
    if GraphDatabase is None: raise RuntimeError("Install dependencies from requirements.txt")
    return GraphDatabase.driver(os.getenv("NEO4J_URI","bolt://localhost:7687"),auth=(os.getenv("NEO4J_USER","neo4j"),os.getenv("NEO4J_PASSWORD","graph-rag-local")))
def ai():
    if not os.getenv("OPENAI_API_KEY"): raise HTTPException(503,"Set OPENAI_API_KEY in project .env to enable extraction and chat.")
    return OpenAI()
def init_graph():
    with driver() as d:
        d.execute_query("CREATE CONSTRAINT entity_key IF NOT EXISTS FOR (e:Entity) REQUIRE e.key IS UNIQUE")
        d.execute_query("CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE")
        d.execute_query("CREATE CONSTRAINT chunk_id IF NOT EXISTS FOR (c:Chunk) REQUIRE c.id IS UNIQUE")
def read_text(path,filename):
    suffix=Path(filename).suffix.lower()
    if suffix in ('.txt','.md','.csv'): return path.read_text(errors='ignore')
    if suffix=='.pdf':
        from pypdf import PdfReader
        return '\n'.join(p.extract_text() or '' for p in PdfReader(str(path)).pages)
    if suffix=='.docx':
        from docx import Document
        return '\n'.join(p.text for p in Document(str(path)).paragraphs)
    raise HTTPException(415,"Supported formats: PDF, DOCX, TXT, Markdown and CSV")
def split_text(text,size=1300):
    words=text.split(); return [' '.join(words[i:i+size]) for i in range(0,len(words),size) if words[i:i+size]]
def extract(chunk):
    prompt='You extract supply-chain facts only. Return only JSON with keys entities and relationships. entities: [{name,type,description}]. Use types from Supplier, Manufacturer, Company, Component, Product, Facility, Region, Country, Port, RiskEvent, Regulation, Person. relationships: [{source,target,type,description}]. Use relationship types from SUPPLIES, MANUFACTURES, SOURCES_FROM, PART_OF, LOCATED_IN, SHIPS_THROUGH, AFFECTED_BY, DISRUPTED_BY, OPERATES_IN, OWNED_BY, MITIGATES, RELATED_TO. Extract only explicit supply-chain relationships and risks stated in the passage; do not infer. Exact names, max 20 entities and 30 relationships.'
    r=ai().chat.completions.create(model=os.getenv("EXTRACTION_MODEL","gpt-4o-mini"),temperature=0,response_format={"type":"json_object"},messages=[{"role":"system","content":prompt},{"role":"user","content":chunk}])
    try: return json.loads(r.choices[0].message.content or '{}')
    except json.JSONDecodeError: return {"entities":[],"relationships":[]}

ENTITY_TYPES={"Supplier","Manufacturer","Company","Component","Product","Facility","Region","Country","Port","RiskEvent","Regulation","Person"}
RELATION_TYPES={"SUPPLIES","MANUFACTURES","SOURCES_FROM","PART_OF","LOCATED_IN","SHIPS_THROUGH","AFFECTED_BY","DISRUPTED_BY","OPERATES_IN","OWNED_BY","MITIGATES","RELATED_TO"}

@app.on_event("startup")
def startup():
    try: init_graph()
    except Exception as e: print(f"Neo4j not ready yet: {e}")
@app.get("/api/health")
def health():
    try:
        with driver() as d: d.verify_connectivity()
        return {"status":"ok","database":"connected"}
    except Exception as e: return {"status":"degraded","detail":str(e)}
@app.get("/api/documents")
def documents():
    try:
        with driver() as d:
            records,_,_=d.execute_query("MATCH (doc:Document) RETURN doc.id AS id,doc.name AS name,doc.status AS status,doc.created AS created ORDER BY doc.created DESC")
        return [dict(r) for r in records]
    except Exception as e: raise HTTPException(503,str(e))
@app.post("/api/documents")
async def upload(file:UploadFile=File(...)):
    limit=int(os.getenv("MAX_UPLOAD_MB","20"))*1024*1024; data=await file.read(limit+1)
    if len(data)>limit: raise HTTPException(413,"File exceeds upload limit")
    name=re.sub(r"[^\w. -]","_",file.filename or "upload"); did=str(uuid.uuid4()); path=UPLOADS/f"{did}_{name}"; path.write_bytes(data)
    try:
        text=read_text(path,name).strip()
        if not text: raise HTTPException(422,"No readable text found")
        with driver() as d:
            d.execute_query("CREATE (doc:Document {id:$id,name:$name,status:'processing',created:datetime()})",id=did,name=name)
            for idx,chunk in enumerate(split_text(text)):
                cid=str(uuid.uuid4()); extracted=extract(chunk)
                d.execute_query("MATCH (doc:Document {id:$did}) CREATE (c:Chunk {id:$cid, text:$text, ordinal:$ord})-[:FROM_DOCUMENT]->(doc)",did=did,cid=cid,text=chunk,ord=idx)
                entmap={}
                for e in extracted.get('entities',[]):
                    ename=str(e.get('name','')).strip()
                    if not ename: continue
                    key=ename.casefold(); entmap[key]=ename
                    proposed_type=re.sub(r'[^A-Za-z0-9_]','',str(e.get('type','')))
                    typ=proposed_type if proposed_type in ENTITY_TYPES else 'Company'
                    d.execute_query("MATCH (c:Chunk {id:$cid}) MERGE (e:Entity {key:$key}) ON CREATE SET e.name=$name,e.type=$type,e.description=$desc MERGE (c)-[:MENTIONS]->(e)",cid=cid,key=key,name=ename,type=typ,desc=str(e.get('description',''))[:400])
                for rel in extracted.get('relationships',[]):
                    src=str(rel.get('source','')).strip(); dst=str(rel.get('target','')).strip()
                    if not src or not dst: continue
                    akey=src.casefold(); bkey=dst.casefold()
                    # Relationship labels are normalized to prevent arbitrary Cypher identifiers.
                    proposed_label=re.sub(r'[^A-Z0-9_]','_',str(rel.get('type','')).upper())[:40]
                    label=proposed_label if proposed_label in RELATION_TYPES else 'RELATED_TO'
                    d.execute_query(f"MATCH (c:Chunk {{id:$cid}}) MERGE (a:Entity {{key:$a}}) ON CREATE SET a.name=$an,a.type='Entity' MERGE (b:Entity {{key:$b}}) ON CREATE SET b.name=$bn,b.type='Entity' MERGE (c)-[:MENTIONS]->(a) MERGE (c)-[:MENTIONS]->(b) MERGE (a)-[r:{label}]->(b) ON CREATE SET r.description=$desc SET r.evidence_ids=coalesce(r.evidence_ids,[])+CASE WHEN $cid IN coalesce(r.evidence_ids,[]) THEN [] ELSE [$cid] END",cid=cid,a=akey,an=src,b=bkey,bn=dst,desc=str(rel.get('description',''))[:400])
            d.execute_query("MATCH (doc:Document {id:$id}) SET doc.status='indexed'",id=did)
        return {"id":did,"name":name,"status":"indexed","chunks":len(split_text(text))}
    except Exception as e:
        try:
            with driver() as d: d.execute_query("MATCH (doc:Document {id:$id}) DETACH DELETE doc",id=did)
        except Exception: pass
        path.unlink(missing_ok=True); raise
@app.delete("/api/documents/{did}")
def delete_document(did:str):
    with driver() as d:
        records,_,_=d.execute_query(
            "MATCH (doc:Document {id:$id}) "
            "WITH doc, doc.id AS deleted_id "
            "OPTIONAL MATCH (c:Chunk)-[:FROM_DOCUMENT]->(doc) "
            "WITH doc, deleted_id, collect(c) AS chunks, collect(c.id) AS cids "
            "FOREACH (c IN chunks | DETACH DELETE c) "
            "DETACH DELETE doc "
            "RETURN deleted_id AS id, cids",
            id=did
        )
        if not records: raise HTTPException(404,"Document not found")
        cids = records[0]["cids"] or []
        if cids:
            d.execute_query(
                "MATCH (:Entity)-[r]->(:Entity) "
                "WHERE r.evidence_ids IS NOT NULL "
                "SET r.evidence_ids = [x IN r.evidence_ids WHERE NOT x IN $cids] "
                "WITH r WHERE size(r.evidence_ids) = 0 "
                "DELETE r",
                cids=cids
            )
        d.execute_query("MATCH (e:Entity) WHERE NOT (:Chunk)-[:MENTIONS]->(e) AND NOT (e)--() DELETE e")
    for p in UPLOADS.glob(f'{did}_*'): p.unlink(missing_ok=True)
    return {"deleted":did}
@app.get("/api/graph")
def graph():
    with driver() as d:
        nodes,_,_=d.execute_query("MATCH (e:Entity) OPTIONAL MATCH (c:Chunk)-[:MENTIONS]->(e)-[r]-(other:Entity) RETURN e.key AS key,e.name AS name,e.type AS type,count(DISTINCT c) AS mentions,collect(DISTINCT {source:e.name,target:other.name,type:type(r)})[0..5] AS rels ORDER BY mentions DESC LIMIT 120")
        edges,_,_=d.execute_query("MATCH (a:Entity)-[r]->(b:Entity) RETURN a.key AS source,b.key AS target,type(r) AS type LIMIT 240")
    return {"nodes":[dict(n) for n in nodes],"edges":[dict(e) for e in edges]}
class Question(BaseModel): question:str
@app.post("/api/chat")
def chat(req:Question):
    q=req.question.strip()
    if not q: raise HTTPException(400,"Question is required")
    with driver() as d:
        records,_,_=d.execute_query("MATCH (seed:Entity) WHERE toLower(seed.name) CONTAINS toLower($q) OR toLower($q) CONTAINS toLower(seed.name) OR any(w IN split(toLower($q),' ') WHERE size(w)>3 AND toLower(seed.name) CONTAINS w) WITH DISTINCT seed LIMIT 8 MATCH p=(seed)-[*1..2]-(other:Entity) UNWIND relationships(p) AS rel UNWIND coalesce(rel.evidence_ids,[]) AS evidence_id MATCH (c:Chunk {id:evidence_id})-[:FROM_DOCUMENT]->(doc:Document) RETURN seed.name AS entity,seed.type AS entity_type,labels(other) AS endpoint_labels,other.name AS related,type(rel) AS relation,rel.description AS relationship_evidence,c.text AS evidence,doc.name AS document LIMIT 40",q=q)
    usable=[dict(r) for r in records if r['evidence'] or r['related']]
    if not usable: return {"answer":"I could not find matching entities or connected evidence in the graph. Try asking with a specific name or upload relevant documents.","sources":[]}
    context='\n'.join(f"Entity: {x['entity']} ({x['entity_type']}); relationship: {x['relation'] or 'mentioned'} {x['related'] or ''}; source: {x['document'] or 'unknown'}; evidence: {x['evidence'] or ''}" for x in usable)
    answer=ai().chat.completions.create(model=os.getenv("CHAT_MODEL","gpt-4o-mini"),temperature=0,messages=[{"role":"system","content":"You are a supply-chain risk research assistant. Answer only questions about suppliers, manufacturers, components, products, logistics, regions, and supply-chain disruptions. If a question is outside that scope, politely state that this tool is limited to supply-chain research. Use only the supplied graph paths and source evidence; do not invent dependencies, risk levels, or causal claims. Explain when a connection is one or two relationship steps away. Cite evidence as [Source N]. If evidence is inadequate, say so."},{"role":"user","content":f"Supply-chain question: {q}\n\nGraph paths and source evidence:\n{context}"}]).choices[0].message.content or ''
    unique=[]; seen=set()
    for x in usable:
        key=(x['document'],x['evidence'])
        if key not in seen and x['evidence']:
            seen.add(key); unique.append({"document":x['document'],"text":x['evidence']})
    return {"answer":answer,"sources":unique[:8]}
app.mount('/ui',StaticFiles(directory='ui'),name='ui')
@app.get('/')
def index(): return FileResponse('ui/index.html')
