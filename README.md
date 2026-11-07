# 🔗 Supply Chain Risk Explorer — Graph RAG

A graph-based knowledge extraction and question-answering tool for supply chain research. Upload supplier documents, extract entities and relationships into a knowledge graph, and ask multi-hop questions with cited source evidence.

---

## 🌍 Overview

This app is scoped to supply-chain research. Upload supplier reports, procurement documents, logistics reports, and relevant public company disclosures. It extracts suppliers, manufacturers, components, products, facilities, regions, ports, risk events, and related supply-chain facts using a bounded set of relationship types.

Questions can follow connections up to two graph steps — for example, _"Which manufacturers connect to this supplier, and what evidence supports that link?"_ — and cite passages recorded as evidence for each relationship. Use public or clearly labeled sample data for demonstration; extracted relationships are research leads that need validation.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | [FastAPI](https://fastapi.tiangolo.com/) + [Uvicorn](https://www.uvicorn.org/) |
| **Graph Database** | [Neo4j 5 Community](https://neo4j.com/) (Cypher, Bolt protocol) |
| **AI / LLM** | [OpenAI API](https://platform.openai.com/) — `gpt-4o-mini` (extraction + chat) |
| **Document Parsing** | [pypdf](https://pypdf.readthedocs.io/) · [python-docx](https://python-docx.readthedocs.io/) · plain text / CSV / Markdown |
| **Frontend** | Vanilla HTML · CSS · JavaScript (no framework) |
| **Containerization** | [Docker](https://www.docker.com/) + [Docker Compose](https://docs.docker.com/compose/) |
| **Language** | Python 3.11+ |

---

## ⚙️ Implementation

Standalone knowledge-graph question-answering app using FastAPI, Neo4j, and a browser UI. It extracts named entities and relationships from uploaded text, links facts to source chunks, and answers questions from matching graph facts with citations.

**Entity types extracted:** `Supplier`, `Manufacturer`, `Company`, `Component`, `Product`, `Facility`, `Region`, `Country`, `Port`, `RiskEvent`, `Regulation`, `Person`

**Relationship types:** `SUPPLIES`, `MANUFACTURES`, `SOURCES_FROM`, `PART_OF`, `LOCATED_IN`, `SHIPS_THROUGH`, `AFFECTED_BY`, `DISRUPTED_BY`, `OPERATES_IN`, `OWNED_BY`, `MITIGATES`, `RELATED_TO`

---

## 🚀 Run Locally

### Prerequisites
- [Docker](https://www.docker.com/get-started) & Docker Compose installed
- An [OpenAI API key](https://platform.openai.com/api-keys)

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/shivang17d/Supply-Chain-Risk-Explorer.git
cd Supply-Chain-Risk-Explorer

# 2. Set up environment variables
cp .env.example .env
# Edit .env and add your OpenAI API key

# 3. Start the app
docker compose up --build
```

- 🌐 App UI: http://localhost:8001
- 🗄️ Neo4j Browser: http://localhost:7474 (credentials: `neo4j` / `graph-rag-local`)

**Accepted formats:** PDF, DOCX, TXT, Markdown, CSV — default upload limit is **20 MB**

Uploaded originals are kept under `uploads/`; Neo4j persists graph data in a named Docker volume.

---

## 📡 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Health check & DB connectivity |
| `GET` | `/api/documents` | List all indexed documents |
| `POST` | `/api/documents` | Upload a document (`multipart/form-data`, field: `file`) |
| `DELETE` | `/api/documents/{id}` | Delete a document and its graph data |
| `GET` | `/api/graph` | Retrieve graph nodes and edges |
| `POST` | `/api/chat` | Ask a question (`{ "question": "..." }`) |

📖 Interactive API docs: http://localhost:8001/docs

---

## 🏗️ Design Notes

- The extraction prompt constrains entity and relationship categories strictly to the supply-chain domain.
- Typed graph edges store the IDs of the source chunks that support them.
- Retrieval matches entities in the question, traverses paths up to **two edges**, and returns supporting passages as citations.
- Entity matching is currently **lexical** — model-extracted facts still require human validation.
- For production use, add: auth, quotas, file scanning, schema migrations, background jobs, observability, backups, and secured credentials.

> **Note:** Documents indexed before relationship evidence tracking was added should be re-uploaded to attach source passages to their graph relationships.

---

## 📄 License

MIT
