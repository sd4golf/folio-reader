# Folio

A private, local-first PDF reader inspired by the focused reading experience of modern flipbook applications. PDFs are rendered in the browser with PDF.js and are never uploaded.

## Run locally

```bash
npm install
npm run dev
```

Open the printed local URL, then drop in a PDF.

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

The selected file is read through the browser's File API. No backend, analytics, account, or upload endpoint exists in this project.
