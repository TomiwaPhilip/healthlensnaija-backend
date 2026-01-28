# HealthLens Newsroom: Backend Specification & AI Architecture

## Overview
The "Newsroom" module is a generative AI workspace designed to help health journalists and administrators create data-driven stories. The frontend has been implemented with a polished UI/UX using React and mocked data. This document outlines the backend requirements, API endpoints, and proposed AI architecture to make this system fully functional.

## 1. Data Models

### 1.1 Story (Project)
A "Story" represents a single workspace session.
```json
{
  "id": "uuid",
  "title": "Malaria Intervention Strategy 2026",
  "status": "draft | published",
  "preview_text": "Brief summary or excerpt...",
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "metadata": {
      "tags": ["malaria", "health"],
      "region": "Lagos"
  }
}
```

### 1.2 Conversation (Chat)
Chat history associated with a specific story.
```json
{
  "id": "uuid",
  "story_id": "uuid",
  "role": "user | assistant | system",
  "content": "Analyze the attached PDF...",
  "timestamp": "ISO-8601"
}
```

### 1.3 Artifact (Generated Content)
Structured outputs created during the chat session (e.g., drafted articles, summaries).
```json
{
  "id": "uuid",
  "story_id": "uuid",
  "title": "Executive Summary",
  "type": "story | report | summary",
  "content": "# Markdown content...",
  "created_at": "ISO-8601"
}
```

### 1.4 Source (Context)
Documents uploaded by the user to ground the AI's responses (RAG Context).
```json
{
  "id": "uuid",
  "story_id": "uuid",
  "filename": "Q3_Report.pdf",
  "file_type": "application/pdf",
  "file_url": "s3_url_or_local_path",
  "vector_status": "pending | indexed | failed",
  "uploaded_at": "ISO-8601"
}
```

---

## 2. API Endpoints

### 2.1 Dashboard & Management
| Method | Endpoint | Description | Request Body | Response |
|~|~|~|~|~|
| `GET` | `/api/stories` | List all stories (with search/filter) | `?q=searchterm` | `[Story]` |
| `POST` | `/api/stories` | Initialize a new story workspace | `{ title: string }` | `Story` |
| `GET` | `/api/stories/:id` | Get story details | - | `Story` |
| `DELETE`| `/api/stories/:id` | Delete a story and its data | - | `{ success: true }` |

### 2.2 Chat Interface
| Method | Endpoint | Description | Request Body | Response |
|~|~|~|~|~|
| `GET` | `/api/stories/:id/chat` | Load chat history | `?limit=50` | `[Message]` |
| `POST` | `/api/stories/:id/chat` | Send message to AI | `{ message: string }` | `Stream<String>` (SSE) |

**Streaming Note:** The core chat endpoint should ideally use Server-Sent Events (SSE) or WebSockets to stream the LLM generation token-by-token to the frontend for a responsive UX.

### 2.3 Artifact Management
| Method | Endpoint | Description | Request Body | Response |
|~|~|~|~|~|
| `GET` | `/api/stories/:id/artifacts` | List generated artifacts | - | `[Artifact]` |
| `POST` | `/api/stories/:id/artifacts` | Save new artifact manually | `{ title, type, content }` | `Artifact` |
| `PUT` | `/api/artifacts/:id` | Update artifact content | `{ content: string }` | `Artifact` |
| `DELETE`| `/api/artifacts/:id` | Remove artifact | - | `{ success: true }` |
| `POST` | `/api/artifacts/:id/export` | Export to PDF/Docx | `{ format: 'pdf' }` | `Binary Blob` |

### 2.4 Data Sources (RAG)
| Method | Endpoint | Description | Request Body | Response |
|~|~|~|~|~|
| `GET` | `/api/stories/:id/sources` | List attached sources | - | `[Source]` |
| `POST` | `/api/stories/:id/sources` | Upload file for indexing | `FormData { file }` | `Source` |
| `DELETE`| `/api/sources/:id` | Remove source & embeddings | - | `{ success: true }` |

---

## 3. AI Architecture & RAG Pipeline

To enable "Data-Driven" storytelling, the backend must implement a Retrieval-Augmented Generation (RAG) pipeline.

### 3.1 Architecture Overview
1.  **Ingestion Service**: Notifies when a file is uploaded to `/api/sources`.
2.  **Processing Worker**:
    *   Extracts text from PDF/Docx/CSV.
    *   Chunks text into manageably sized segments (e.g., 500-1000 tokens).
    *   Generates Embeddings (using OpenAI `text-embedding-3-small` or similar).
    *   Stores embeddings in a Vector Database (Pinecone, Milvus, or PGVector).
3.  **Retriever**:
    *   When a user sends a message, existing logic searches the Vector DB for chunks relevant to the query.
4.  **Generator (LLM)**:
    *   Constructs a prompt containing: System Instructions + Retrieved Context + User Query.
    *   Sends to LLM (GPT-4o, Claude 3.5 Sonnet).
    *   Streams response back to client.

### 3.2 Recommended Stack
*   **Backend Framework**: Node.js (Express) or Python (FastAPI/Django) - *Current project structure suggests Node.js backend exists.*
*   **Vector Database**: `pgvector` (if using PostgreSQL) is easiest for operational simplicity.
*   **LLM Provider**: OpenAI API (standard choice) or Anthropic (excellent for long context/writing).
*   **Orchestration**: LangChain.js or Vercel AI SDK.

### 3.3 System Prompt Strategy
The "Newsroom" persona should be defined in the system prompt.
> "You are an expert Health Journalist AI assistant. Your goal is to help users write accurate, data-backed health stories. Always cite the specific documents provided in the context when making claims. If the information is not in the sources, state that clearly."

## 4. Implementation Phase Checklist

- [ ] **Database Schema**: Create tables for `Stories`, `Messages`, `Artifacts`, `Sources` in MongoDB/SQL.
- [ ] **File Storage**: Set up S3 bucket or local `/uploads` folder for source documents.
- [ ] **Vector Search**: specialized collection/table for document embeddings.
- [ ] **API Logic**: Implement the CRUD endpoints listed above.
- [ ] **Integration**: Replace frontend `mockData` and `setTimeout` calls with real `fetch`/`axios` calls to these endpoints.
