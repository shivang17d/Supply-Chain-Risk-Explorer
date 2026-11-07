# Supply Chain Risk Explorer — Graph RAG

## Real-world example

This app is scoped to supply-chain research. Upload supplier reports, procurement documents, logistics reports, and relevant public company disclosures. It extracts suppliers, manufacturers, components, products, facilities, regions, ports, risk events, and related supply-chain facts using a bounded set of relationship types. Questions can follow connections up to two graph steps—for example, “Which manufacturers connect to this supplier, and what evidence supports that link?”—and cite passages recorded as evidence for each relationship. Use public or clearly labeled sample data for demonstration; extracted relationships are research leads that need validation.

## Implementation

Standalone knowledge-graph question-answering app using FastAPI, Neo4j, and a browser UI. It extracts named entities and relationships from uploaded text, links facts to source chunks, and answers questions from matching graph facts with citations.

## Run locally

1. Copy `.env.example` to `.env` and add an OpenAI API key for entity extraction and chat.
2. Run `docker compose up --build` from this directory.
3. Open http://localhost:8001. Neo4j Browser is available at http://localhost:7474 (development credentials: `neo4j` / `graph-rag-local`).

Accepted formats: PDF, DOCX, TXT, Markdown, CSV. Default upload limit is 20 MB. Uploaded originals are kept under `uploads/`; Neo4j persists graph data.

## API

- `GET /api/health`, `GET /api/documents`, `GET /api/graph`
- `POST /api/documents` multipart field `file`
- `DELETE /api/documents/{id}`
- `POST /api/chat` JSON `{ "question": "..." }`
- Interactive API docs: `/docs`

## Design notes

The extraction prompt constrains entity and relationship categories to the supply-chain domain. Typed graph edges store the IDs of the source chunks that support them; retrieval matches entities in the question, traverses paths up to two edges, and returns those supporting passages. Entity matching is currently lexical, and model-extracted facts still require validation. For production, add auth, quotas, file scanning, migrations, background jobs, observability, backups, and secured credentials.

Documents indexed before relationship evidence tracking was added should be uploaded again to attach source passages to their graph relationships.
