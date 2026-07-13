# Folio

Current release: Version 2.0.0

A private, local-first document reader inspired by the focused reading experience of modern flipbook applications. Documents are rendered in the browser and are never uploaded.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL, then drop in a supported document.

## Supported formats

- PDF
- EPUB and CBZ
- DOCX
- Markdown, plain text, and HTML
- JPG/JPEG, PNG, WebP, GIF, AVIF, and SVG

## Features

- Single-page and two-page spread layouts
- Animated page turns and page-edge navigation
- Lazy page thumbnails
- Full-document text search for text-based PDFs
- Zoom, fullscreen, light/dark themes, and local download
- Keyboard navigation: arrow keys, Page Up/Down, Home, End, and Cmd/Ctrl+F
- Last page restored independently for each local file
- Responsive mobile layout

## Privacy

The selected file is read through the browser's File API and stored locally in IndexedDB for the document library. No backend, analytics, account, or upload endpoint exists in this project.
