# RAG: Search, Context, Answer (in Russian)

A free Russian-language book on building a document-grounded assistant that cites its sources and refuses honestly when there is no answer. From raw documents to answer evaluation: cleaning, chunking, BM25, vector search, hybrid fusion, reranking, access control, freshness, evaluation, production. Third book in the "LLM in practice" series.

- [Book PDF (Russian)](../../releases/latest) · [Changelog](CHANGELOG.md) · [Report an error](../../issues/new/choose)
- The book itself is Russian-only for now; this file explains the repository for international visitors.

## The laboratory

Node.js 24, no external packages, no network. The corpus is a fictional store ("Polka"): 32 internal documents with duplicates, versions, access roles and one injected instruction; 40 labeled test questions including conversational ones.

```bash
npm test                          # unit and book-number tests
npm run ask -- "можно ли вернуть уценённый товар"
npm run numbers                   # every number in the book, regenerated
npm run build                     # print the book PDF (pandoc, poppler-utils, Chrome)
```

Every number printed in the book comes from this repository's code and is substituted into chapters at build time; toy embeddings (character trigrams) stay toy, and the README says so explicitly.

## Series

1. [LLM Theory and AI Lab Practice](https://github.com/ilyautov/llm-manual-lab)
2. [Agent Engineering](https://github.com/ilyautov/agents-manual-lab)
3. RAG: Search, Context, Answer (this repo)

## Licenses

Book text: CC BY-NC 4.0. Laboratory code: MIT. Fonts: SIL OFL 1.1.
