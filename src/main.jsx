import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import HTMLFlipBook from 'react-pageflip';
import JSZip from 'jszip';
import { marked } from 'marked';
import mammoth from 'mammoth/mammoth.browser';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  BookOpen, Bookmark, ChevronLeft, ChevronRight, Download, Expand, FileText,
  Grid2X2, Library, List, LoaderCircle, Minus, Moon, MoreHorizontal,
  PanelLeftClose, PanelLeftOpen, Palette, Plus, RotateCcw, Search, Sun, Type, Upload, X
} from 'lucide-react';
import './styles.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

const libraryDB = {
  open: () => new Promise((resolve,reject) => { const request=indexedDB.open('folio-library',1); request.onupgradeneeded=()=>request.result.createObjectStore('pdfs',{keyPath:'id'}); request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error) }),
  async all(){const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('pdfs').objectStore('pdfs').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})},
  async put(record){const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('pdfs','readwrite').objectStore('pdfs').put(record);r.onsuccess=resolve;r.onerror=()=>reject(r.error)})},
  async remove(id){const db=await this.open();return new Promise((resolve,reject)=>{const r=db.transaction('pdfs','readwrite').objectStore('pdfs').delete(id);r.onsuccess=resolve;r.onerror=()=>reject(r.error)})}
};

const supportedExtensions = ['pdf','jpg','jpeg','png','webp','gif','avif','svg','cbz','epub','docx','md','markdown','txt','html','htm'];
const fileExtension = file => file.name.split('.').pop().toLowerCase();
const isSupported = file => file && supportedExtensions.includes(fileExtension(file));
const cleanHtml = html => { const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('script,iframe,object,embed,form').forEach(x=>x.remove());doc.querySelectorAll('*').forEach(el=>[...el.attributes].forEach(a=>{if(a.name.startsWith('on'))el.removeAttribute(a.name)}));return doc.body.innerHTML };
const paginateHtml = html => { const doc=new DOMParser().parseFromString(cleanHtml(html),'text/html'), pages=[];let chunk='',size=0;for(const node of doc.body.children){const part=node.outerHTML,n=(node.textContent||'').length;if(chunk&&size+n>1800){pages.push({kind:'html',html:chunk,text:new DOMParser().parseFromString(chunk,'text/html').body.textContent||''});chunk='';size=0}chunk+=part;size+=n}if(chunk)pages.push({kind:'html',html:chunk,text:doc.body.textContent||''});return pages.length?pages:[{kind:'html',html:'<p>This document is empty.</p>',text:''}] };

async function parseLocalDocument(file){
  const ext=fileExtension(file), urls=[];
  if(ext==='pdf')return {kind:'pdf',pdf:null,pages:[],urls};
  if(['jpg','jpeg','png','webp','gif','avif','svg'].includes(ext)){const src=URL.createObjectURL(file);return {kind:'pages',pages:[{kind:'image',src,text:file.name}],urls:[src]}}
  if(ext==='txt'){const text=await file.text();return {kind:'pages',pages:text.match(/[\s\S]{1,2200}/g)?.map(text=>({kind:'text',text}))||[{kind:'text',text:''}],urls}}
  if(ext==='md'||ext==='markdown')return {kind:'pages',pages:paginateHtml(await marked.parse(await file.text())),urls};
  if(ext==='html'||ext==='htm')return {kind:'pages',pages:paginateHtml(await file.text()),urls};
  if(ext==='docx'){const result=await mammoth.convertToHtml({arrayBuffer:await file.arrayBuffer()});return {kind:'pages',pages:paginateHtml(result.value),urls}}
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  if(ext==='cbz'){const names=Object.keys(zip.files).filter(n=>/\.(jpe?g|png|webp|gif|avif|svg)$/i.test(n)&&!zip.files[n].dir).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));const pages=[];for(const name of names){const src=URL.createObjectURL(await zip.files[name].async('blob'));urls.push(src);pages.push({kind:'image',src,text:name})}if(!pages.length)throw new Error('No supported images were found in this CBZ file.');return {kind:'pages',pages,urls}}
  if(ext==='epub'){const container=await zip.file('META-INF/container.xml')?.async('text');const rootPath=container?.match(/full-path=["']([^"']+)/)?.[1];if(!rootPath)throw new Error('Invalid EPUB package.');const opf=await zip.file(rootPath)?.async('text'),opfDoc=new DOMParser().parseFromString(opf,'application/xml'),base=rootPath.includes('/')?rootPath.slice(0,rootPath.lastIndexOf('/')+1):'';const manifest=new Map([...opfDoc.querySelectorAll('manifest item')].map(x=>[x.getAttribute('id'),x.getAttribute('href')]));const chapterNames=[...opfDoc.querySelectorAll('spine itemref')].map(x=>manifest.get(x.getAttribute('idref'))).filter(Boolean);let pages=[];for(const name of chapterNames){const html=await zip.file(base+decodeURIComponent(name))?.async('text');if(html)pages.push(...paginateHtml(html))}if(!pages.length)throw new Error('No readable chapters were found in this EPUB.');return {kind:'pages',pages,urls}}
  throw new Error('Unsupported document format.');
}

const IconButton = ({ label, active, children, className = '', ...props }) => (
  <button className={`icon-btn ${active ? 'active' : ''} ${className}`} title={label} aria-label={label} {...props}>{children}</button>
);

function EmptyState({ onFile, dragging, setDragging }) {
  const input = useRef();
  return <main className="empty-shell">
    <nav className="landing-nav">
      <div className="brand"><span className="brand-mark"><BookOpen size={20}/></span> Folio</div>
      <span className="privacy-pill"><span/> Your files stay on this device</span>
    </nav>
    <section className="hero">
      <div className="eyebrow">A QUIETER WAY TO READ</div>
      <h1>Your PDFs,<br/><em>beautifully</em> presented.</h1>
      <p>Turn any PDF into an elegant, tactile reading experience.<br className="desktop"/> No uploads. No accounts. Just open and read.</p>
      <div className={`dropzone ${dragging ? 'dragging' : ''}`}
        onDragOver={e => {e.preventDefault(); setDragging(true)}}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files[0])}}
        onClick={() => input.current.click()}>
        <input ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.svg,.cbz,.epub,.docx,.md,.markdown,.txt,.html,.htm" onChange={e => onFile(e.target.files[0])}/>
        <span className="upload-icon"><Upload size={25}/></span>
        <strong>Drop a document here</strong>
        <span>or click to choose from your device</span>
        <button>Choose document</button>
      </div>
      <div className="format-list"><span>SUPPORTED FORMATS</span><p>PDF · EPUB · DOCX · CBZ · Markdown · TXT · HTML · JPG · PNG · WebP · GIF · AVIF · SVG</p></div>
      <div className="features">
        <div><BookOpen/><span><strong>Natural page turns</strong><small>Read like a real publication</small></span></div>
        <div><Search/><span><strong>Find anything</strong><small>Search text across every page</small></span></div>
        <div><Expand/><span><strong>Made for focus</strong><small>Clean, immersive fullscreen</small></span></div>
      </div>
    </section>
    <footer><span>Folio Reader</span><span>Private by design · Works offline</span></footer>
  </main>
}

function PageCanvas({ pdf, number, scale, onReady, onError, thumb = false }) {
  const canvas = useRef(), textLayerRef = useRef(), renderRef = useRef();
  useEffect(() => {
    if (!pdf || number < 1 || number > pdf.numPages) return;
    let cancelled = false, task, textLayer;
    pdf.getPage(number).then(page => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const desired = thumb ? 150 : Math.min(1400, Math.max(520, window.innerHeight * .72)) * scale;
      const viewport = page.getViewport({ scale: desired / base.height });
      const c = canvas.current, ratio = Math.min(window.devicePixelRatio || 1, 2);
      c.width = viewport.width * ratio; c.height = viewport.height * ratio;
      c.style.aspectRatio = `${viewport.width}/${viewport.height}`;
      if(renderRef.current){renderRef.current.style.width=`${viewport.width}px`;renderRef.current.style.height=`${viewport.height}px`;renderRef.current.style.aspectRatio=`${viewport.width}/${viewport.height}`}
      const ctx = c.getContext('2d', { alpha: false });
      task = page.render({ canvasContext: ctx, viewport, transform: ratio === 1 ? null : [ratio,0,0,ratio,0,0] });
      task.promise.then(() => !cancelled && onReady?.()).catch(error => {
        if (!cancelled && error?.name !== 'RenderingCancelledException') onError?.(error);
      });
      if(!thumb&&textLayerRef.current){textLayerRef.current.replaceChildren();textLayerRef.current.style.setProperty('--total-scale-factor',viewport.scale);page.getTextContent({includeMarkedContent:true}).then(text=>{if(cancelled)return;textLayer=new pdfjsLib.TextLayer({textContentSource:text,container:textLayerRef.current,viewport});return textLayer.render()}).catch(()=>{})}
    }).catch(error => !cancelled && onError?.(error));
    return () => { cancelled = true; task?.cancel(); textLayer?.cancel() };
  }, [pdf, number, scale, thumb]);
  if(thumb)return <canvas ref={canvas} className="thumb-canvas"/>;
  return <div ref={renderRef} className="page-render"><canvas ref={canvas} className="page-canvas"/><div ref={textLayerRef} className="textLayer"/></div>;
}

function DocumentPage({pdf, content, number, scale=1, thumb=false, onError}) {
  if(pdf)return <PageCanvas pdf={pdf} number={number} scale={scale} thumb={thumb} onError={onError}/>;
  const item=content?.[number-1];
  if(!item)return null;
  if(item.kind==='image')return <img className={thumb?'thumb-content':'document-image'} src={item.src} alt={`Page ${number}`}/>;
  if(item.kind==='text')return <div className={thumb?'thumb-content text-thumb':'content-page plain-text'}>{item.text}</div>;
  return <div className={thumb?'thumb-content html-thumb':'content-page'} dangerouslySetInnerHTML={{__html:item.html}}/>;
}

const FlipPage = forwardRef(function FlipPage({pdf, content, number, scale, onError}, ref) {
  return <div ref={ref} className="flip-page">
    <DocumentPage pdf={pdf} content={content} number={number} scale={scale} onError={onError}/>
    <span className="page-num">{number}</span>
  </div>;
});

function Sidebar({ pdf, content, pageCount, current, go, open, tab, setTab, searchIndex, outline, bookmarks, toggleBookmark }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return searchIndex.map((text, i) => ({ i: i + 1, text:text||'', at: (text||'').toLowerCase().indexOf(q) }))
      .filter(x => x.at >= 0).slice(0, 50);
  }, [query, searchIndex]);
  if (!open || (!pdf && !content?.length)) return null;
  return <aside className="sidebar">
    <div className="side-tabs">
      <button className={tab==='pages'?'active':''} onClick={()=>setTab('pages')}><Grid2X2 size={16}/> Pages</button>
      <button className={tab==='search'?'active':''} onClick={()=>setTab('search')}><Search size={16}/> Search</button>
      <button className={tab==='navigate'?'active':''} onClick={()=>setTab('navigate')}><Bookmark size={16}/> Saved</button>
    </div>
    {tab === 'search' ? <div className="search-pane">
      <div className="search-input"><Search size={16}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search this document…"/>{query&&<X size={15} onClick={()=>setQuery('')}/>}</div>
      {query.length < 2 ? <p className="hint">Enter at least 2 characters to search every page.</p> :
       results.length ? <div className="results">{results.map(r => <button key={r.i} onClick={()=>go(r.i)}><b>Page {r.i}</b><span>…{r.text.slice(Math.max(0,r.at-38),r.at+80)}…</span></button>)}</div> : <p className="hint">No results found.</p>}
    </div> : tab === 'navigate' ? <div className="navigate-pane">
      <div className="nav-section"><h3>Bookmarks</h3>{bookmarks.length?bookmarks.map(n=><div className="saved-page" key={n}><button onClick={()=>go(n)}><Bookmark/> Page {n}</button><IconButton label="Remove bookmark" onClick={()=>toggleBookmark(n)}><X/></IconButton></div>):<p className="hint">Bookmark a page to find it here.</p>}</div>
      {!!outline.length&&<div className="nav-section"><h3>Contents</h3>{outline.map((item,i)=><button className="outline-item" style={{paddingLeft:`${10+item.depth*12}px`}} key={`${item.title}-${i}`} disabled={!item.page} onClick={()=>item.page&&go(item.page)}><span>{item.title}</span>{item.page&&<small>{item.page}</small>}</button>)}</div>}
    </div> : <div className="thumbs">{Array.from({length:pageCount},(_,i)=>i+1).map(n=><button key={n} className={current===n?'current':''} onClick={()=>go(n)}><DocumentPage pdf={pdf} content={content} number={n} scale={1} thumb/><span>{n}</span></button>)}</div>}
  </aside>
}

function Reader({ file, onClose, documents, onOpenDocument, onAddDocument, onCloseDocument }) {
  const [pdf, setPdf] = useState(null), [content, setContent] = useState([]), [page, setPage] = useState(1), [zoom, setZoom] = useState(1);
  const [pan,setPan] = useState({x:0,y:0}), [panning,setPanning] = useState(false);
  const [sidebar, setSidebar] = useState(true), [tab, setTab] = useState('pages'), [spread, setSpread] = useState(true);
  const [dark, setDark] = useState(false), [grayscale, setGrayscale] = useState(false), [loading, setLoading] = useState(true);
  const [textView,setTextView] = useState(false);
  const [error, setError] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false), [libraryQuery, setLibraryQuery] = useState('');
  const [outline,setOutline] = useState([]), [bookmarks,setBookmarks] = useState(()=>JSON.parse(localStorage.getItem(`folio:bookmarks:${file.name}:${file.size}`)||'[]'));
  const [ocrState,setOcrState] = useState({page:null,status:'',progress:0,error:''});
  const [searchIndex, setSearchIndex] = useState([]); const rootRef = useRef(), bookRef = useRef(), addFileRef = useRef(), ocrWorkerRef = useRef(), panRef = useRef();
  const downloadUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const maxPage = pdf?.numPages || content.length || 1;
  const readProgress = maxPage > 1 ? (page - 1) / (maxPage - 1) : .5;
  useEffect(() => () => URL.revokeObjectURL(downloadUrl), [downloadUrl]);
  useEffect(() => {
    let dead = false, task, model;
    const load = async () => {
      setLoading(true); setError('');
      try {
        model=await parseLocalDocument(file);
        if(model.kind==='pdf'){
          const bytes=new Uint8Array(await file.arrayBuffer());task=pdfjsLib.getDocument({data:bytes,useWorkerFetch:false});const doc=await task.promise;if(dead)return;
          setPdf(doc);setContent([]);setPage(Math.min(+(localStorage.getItem(`folio:${file.name}:${file.size}`)||1),doc.numPages));
          setSearchIndex(Array(doc.numPages).fill(undefined));
          (async()=>{const saved=Math.min(+(localStorage.getItem(`folio:${file.name}:${file.size}`)||1),doc.numPages),priority=[saved,...(saved<doc.numPages?[saved+1]:[]),...Array.from({length:doc.numPages},(_,i)=>i+1)].filter((n,i,a)=>a.indexOf(n)===i);for(const n of priority){if(dead)return;try{const text=(await (await doc.getPage(n)).getTextContent()).items.map(x=>x.str).join(' '),cached=localStorage.getItem(`folio:ocr:${file.name}:${file.size}:${n}`)||'';if(!dead)setSearchIndex(current=>{const next=[...current];next[n-1]=text||cached;return next})}catch{if(!dead)setSearchIndex(current=>{const next=[...current];next[n-1]=localStorage.getItem(`folio:ocr:${file.name}:${file.size}:${n}`)||'';return next})}}})();
          doc.getOutline().then(async tree=>{const flat=[];const walk=(items=[],depth=0)=>items.forEach(item=>{flat.push({title:item.title,depth,dest:item.dest});walk(item.items,depth+1)});walk(tree);const resolved=await Promise.all(flat.map(async item=>{try{const dest=typeof item.dest==='string'?await doc.getDestination(item.dest):item.dest;return {...item,page:dest?await doc.getPageIndex(dest[0])+1:null}}catch{return {...item,page:null}}}));if(!dead)setOutline(resolved)}).catch(()=>{});
        }else{
          if(dead)return;setPdf(null);setContent(model.pages);setOutline([]);setSearchIndex(model.pages.map(x=>x.text||''));setPage(Math.min(+(localStorage.getItem(`folio:${file.name}:${file.size}`)||1),model.pages.length));
        }
        setLoading(false);
      } catch (reason) {
        if (!dead) { setLoading(false); setError(reason?.name === 'PasswordException' ? 'This PDF is password protected.' : `Could not open this document${reason?.message ? `: ${reason.message}` : '.'}`); }
      }
    };
    load(); return()=>{dead=true;task?.destroy();model?.urls?.forEach(URL.revokeObjectURL)};
  }, [file]);
  useEffect(()=>{localStorage.setItem(`folio:${file.name}:${file.size}`,String(page))},[page,file]);
  useEffect(()=>{localStorage.setItem(`folio:bookmarks:${file.name}:${file.size}`,JSON.stringify(bookmarks))},[bookmarks,file]);
  const toggleBookmark=useCallback(n=>setBookmarks(current=>current.includes(n)?current.filter(x=>x!==n):[...current,n].sort((a,b)=>a-b)),[]);
  const runOcr=useCallback(async n=>{
    if(!pdf||ocrState.page)return;setOcrState({page:n,status:'Preparing OCR…',progress:0,error:''});
    try{
      const pageDoc=await pdf.getPage(n),viewport=pageDoc.getViewport({scale:2}),canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;await pageDoc.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
      if(!ocrWorkerRef.current){const {createWorker}=await import('tesseract.js');ocrWorkerRef.current=await createWorker('eng',1,{logger:m=>{if(m.status)setOcrState(current=>({...current,status:m.status.replace(/_/g,' '),progress:m.progress||current.progress}))}})}
      const result=await ocrWorkerRef.current.recognize(canvas),text=result.data.text?.trim()||'';localStorage.setItem(`folio:ocr:${file.name}:${file.size}:${n}`,text);setSearchIndex(current=>{const next=[...current];next[n-1]=text;return next});setOcrState({page:null,status:'',progress:1,error:text?'':'OCR finished but did not find text.'});
    }catch(reason){setOcrState({page:null,status:'',progress:0,error:`OCR failed: ${reason?.message||'Unable to initialize the OCR engine.'}`})}
  },[pdf,file,ocrState.page]);
  useEffect(()=>()=>{ocrWorkerRef.current?.terminate()},[]);
  const go = useCallback(n => {
    const next=Math.max(1,Math.min(maxPage,n)); if(next===page)return;
    if(textView){setPage(next);return}
    const engine=bookRef.current?.pageFlip?.();
    if(!engine){setPage(next);return}
    if(next>page && next-page<=2) engine.flipNext();
    else if(next<page && page-next<=2) engine.flipPrev();
    else engine.turnToPage(next-1);
  },[page,maxPage,textView]);
  useEffect(()=>{const fn=e=>{if(e.target.tagName==='INPUT')return;if(e.key==='ArrowRight'||e.key==='PageDown')go(page+(spread?2:1));if(e.key==='ArrowLeft'||e.key==='PageUp')go(page-(spread?2:1));if(e.key==='Home')go(1);if(e.key==='End')go(maxPage);if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();setSidebar(true);setTab('search')}};addEventListener('keydown',fn);return()=>removeEventListener('keydown',fn)},[go,page,spread,maxPage]);
  useEffect(()=>{const frame=requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));const timer=setTimeout(()=>window.dispatchEvent(new Event('resize')),180);return()=>{cancelAnimationFrame(frame);clearTimeout(timer)}},[sidebar,spread]);
  useEffect(()=>{if(zoom<=1)setPan({x:0,y:0})},[zoom]);
  const startPan=useCallback(event=>{if(zoom<=1||event.button!==0||event.target.closest('button,a,input,.bottom-bar,.stage-top,.page-arrow'))return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);panRef.current={x:event.clientX,y:event.clientY,startX:pan.x,startY:pan.y};setPanning(true)},[zoom,pan]);
  const movePan=useCallback(event=>{if(!panRef.current)return;const wrap=rootRef.current?.querySelector('.flipbook-wrap'),maxX=Math.max(0,(wrap?.offsetWidth||0)*(zoom-1)/2),maxY=Math.max(0,(wrap?.offsetHeight||0)*(zoom-1)/2),nextX=panRef.current.startX+event.clientX-panRef.current.x,nextY=panRef.current.startY+event.clientY-panRef.current.y;setPan({x:Math.max(-maxX,Math.min(maxX,nextX)),y:Math.max(-maxY,Math.min(maxY,nextY))})},[zoom]);
  const stopPan=useCallback(()=>{panRef.current=null;setPanning(false)},[]);
  useEffect(()=>{
    let observer, frame=requestAnimationFrame(()=>{
      const book=rootRef.current?.querySelector('.natural-book'),wrap=rootRef.current?.querySelector('.flipbook-wrap');if(!book||!wrap)return;
      const sync=()=>{const bookRect=book.getBoundingClientRect(),wrapRect=wrap.getBoundingClientRect(),factor=zoom||1;rootRef.current?.style.setProperty('--book-height',`${bookRect.height/factor}px`);rootRef.current?.style.setProperty('--book-top',`${(bookRect.top-wrapRect.top)/factor}px`)};
      sync();observer=new ResizeObserver(sync);observer.observe(book);observer.observe(wrap);
    });
    return()=>{cancelAnimationFrame(frame);observer?.disconnect()};
  },[sidebar,spread,pdf,content,zoom]);
  return <div ref={rootRef} className={`reader ${dark?'dark':''} ${grayscale?'grayscale':''}`}>
    <header className="reader-header">
      <div className="brand compact"><span className="brand-mark"><BookOpen size={17}/></span> Folio</div>
      <div className="doc-title"><FileText size={16}/><span>{file.name.replace(/\.[^.]+$/,'')}</span><small>{maxPage} pages</small></div>
      <div className="header-actions">
        <IconButton label="Document library" active={libraryOpen} onClick={()=>setLibraryOpen(!libraryOpen)}><Library/></IconButton>
        <IconButton label={bookmarks.includes(page)?'Remove page bookmark':'Bookmark this page'} active={bookmarks.includes(page)} onClick={()=>toggleBookmark(page)}><Bookmark/></IconButton>
        {pdf&&<IconButton label={textView?'Return to page view':'Open selectable text view'} active={textView} onClick={()=>setTextView(!textView)}><Type/></IconButton>}
        <IconButton label={grayscale?'Show original colors':'Show in grayscale'} active={grayscale} onClick={()=>setGrayscale(!grayscale)}><Palette/></IconButton>
        <IconButton label="Toggle theme" onClick={()=>setDark(!dark)}>{dark?<Sun/>:<Moon/>}</IconButton>
        <IconButton label="Fullscreen" onClick={()=>document.fullscreenElement?document.exitFullscreen():rootRef.current.requestFullscreen()}><Expand/></IconButton>
        <IconButton label="Close document" onClick={onClose}><X/></IconButton>
      </div>
      {libraryOpen&&<div className="document-library">
        <div className="library-heading"><div><strong>Your documents</strong><small>{documents.length} document{documents.length===1?'':'s'} in your library</small></div><IconButton label="Close library" onClick={()=>setLibraryOpen(false)}><X/></IconButton></div>
        <div className="library-search"><Search/><input value={libraryQuery} onChange={e=>setLibraryQuery(e.target.value)} placeholder="Find a loaded document…"/></div>
        <div className="library-list">{documents.filter(d=>d.file.name.toLowerCase().includes(libraryQuery.toLowerCase())).map(d=><div key={d.id} className={`library-row ${d.file===file?'selected':''}`}><button className="open-doc" onClick={()=>{onOpenDocument(d.id);setLibraryOpen(false)}}><span className="library-file-icon"><FileText/></span><span><strong>{d.file.name.replace(/\.[^.]+$/,'')}</strong><small>{fileExtension(d.file).toUpperCase()} · {(d.file.size/1048576).toFixed(1)} MB {d.file===file?'· Reading now':''}</small></span><ChevronRight/></button><button className="remove-doc" title={`Close ${d.file.name}`} aria-label={`Close ${d.file.name}`} onClick={()=>onCloseDocument(d.id)}><X/></button></div>)}</div>
        <input ref={addFileRef} hidden type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.avif,.svg,.cbz,.epub,.docx,.md,.markdown,.txt,.html,.htm" onChange={e=>{onAddDocument([...e.target.files]);e.target.value='';setLibraryOpen(false)}}/>
        <button className="add-pdf" onClick={()=>addFileRef.current.click()}><Plus/> Open more documents</button>
        <p>Files stay in this browser session and never leave your device.</p>
      </div>}
    </header>
    <div className="reader-body">
      <Sidebar {...{pdf,content,pageCount:maxPage,current:page,go,open:sidebar,tab,setTab,searchIndex,outline,bookmarks,toggleBookmark}}/>
      <section className={`stage ${zoom>1?'zoomed':''} ${panning?'panning':''}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={stopPan} onPointerCancel={stopPan}>
        <div className="stage-top">
          <IconButton label="Toggle sidebar" active={sidebar} onClick={()=>setSidebar(!sidebar)}>{sidebar?<PanelLeftClose/>:<PanelLeftOpen/>}</IconButton>
          <span className="stage-label">{spread?'SPREAD VIEW':'SINGLE PAGE'}</span>
          <div className="view-switch"><IconButton label="Single page" active={!spread} onClick={()=>setSpread(false)}><FileText/></IconButton><IconButton label="Spread view" active={spread} onClick={()=>setSpread(true)}><BookOpen/></IconButton></div>
        </div>
        <button className="page-arrow left" disabled={page===1} onClick={()=>go(page-(spread?2:1))}><ChevronLeft/></button>
        {loading ? <div className="loading"><LoaderCircle/><span>Opening your document…</span></div> : error ? <div className="load-error"><FileText/><strong>We couldn't open this file</strong><span>{error}</span><button onClick={onClose}>Choose another document</button></div> : textView ? <div className={`selectable-view ${spread?'spread-text':''}`}>
          {[page,...(spread&&page<maxPage?[page+1]:[])].map(n=><article className="selectable-page" key={n}><header><span>Page {n}</span><button disabled={searchIndex[n-1]===undefined} onClick={()=>navigator.clipboard.writeText(searchIndex[n-1]||'')}>Copy page</button></header>{searchIndex[n-1]===undefined?<div className="no-page-text extracting"><LoaderCircle/><strong>Extracting page text…</strong><span>This usually takes only a moment.</span></div>:searchIndex[n-1]?.trim()?<p>{searchIndex[n-1]}</p>:<div className="no-page-text"><Type/><strong>No embedded text on this page</strong><span>Run local OCR to recognize this scanned page and make it searchable and selectable.</span>{ocrState.page===n?<><div className="ocr-progress"><i style={{width:`${Math.round(ocrState.progress*100)}%`}}/></div><small>{ocrState.status} {Math.round(ocrState.progress*100)}%</small></>:<button className="run-ocr" disabled={!!ocrState.page} onClick={()=>runOcr(n)}>Recognize this page</button>}{ocrState.error&&<small className="ocr-error">{ocrState.error}</small>}</div>}</article>)}
        </div> : <div className={`flipbook-wrap ${spread?'is-spread':'is-single'}`} style={{'--zoom':zoom,'--pan-x':`${pan.x}px`,'--pan-y':`${pan.y}px`,'--left-stack':`${3+readProgress*12}px`,'--right-stack':`${3+(1-readProgress)*12}px`,'--left-shadow':`${8+readProgress*20}px`,'--right-shadow':`${8+(1-readProgress)*20}px`}}>
          <HTMLFlipBook key={`${spread?'spread':'single'}-${sidebar?'sidebar':'wide'}`} ref={bookRef} width={520} height={720} size="stretch" minWidth={260} maxWidth={620} minHeight={360} maxHeight={820} showCover={false} showPageCorners={false} usePortrait={!spread} drawShadow={true} maxShadowOpacity={.55} flippingTime={280} mobileScrollSupport={true} clickEventForward={false} useMouseEvents={false} startPage={Math.max(0,page-1)} onFlip={e=>setPage(e.data+1)} className="natural-book">
            {Array.from({length:maxPage},(_,i)=><FlipPage key={i+1} pdf={pdf} content={content} number={i+1} scale={1} onError={e=>setError(`Page rendering failed: ${e.message}`)}/>)}
          </HTMLFlipBook>
        </div>}
        <button className="page-arrow right" disabled={page>=maxPage} onClick={()=>go(page+(spread?2:1))}><ChevronRight/></button>
        <div className="bottom-bar">
          <div className="zoom"><IconButton label="Zoom out" onClick={()=>setZoom(z=>Math.max(.65,z-.15))}><Minus/></IconButton><span>{Math.round(zoom*100)}%</span><IconButton label="Zoom in" onClick={()=>setZoom(z=>Math.min(2,z+.15))}><Plus/></IconButton><IconButton label="Reset zoom" onClick={()=>setZoom(1)}><RotateCcw/></IconButton></div>
          <div className="pager"><button onClick={()=>go(page-(spread?2:1))} disabled={page===1}><ChevronLeft/></button><span><input value={page} onChange={e=>go(+e.target.value||1)}/> / {maxPage}</span><button onClick={()=>go(page+(spread?2:1))} disabled={page>=maxPage}><ChevronRight/></button></div>
          <a className="download" href={downloadUrl} download={file.name}><Download/> Save a copy</a>
        </div>
      </section>
    </div>
  </div>
}

function App(){
  const [documents,setDocuments]=useState([]),[activeId,setActiveId]=useState(null),[dragging,setDragging]=useState(false),[libraryReady,setLibraryReady]=useState(false);
  useEffect(()=>{libraryDB.all().then(records=>{const sorted=records.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));setDocuments(sorted);setActiveId(sorted[0]?.id||null)}).catch(()=>{}).finally(()=>setLibraryReady(true))},[]);
  const addDocuments=useCallback(files=>{
    const valid=(Array.isArray(files)?files:[files]).filter(isSupported);
    if(!valid.length)return;
    setDocuments(current=>{const next=[...current];for(const file of valid){const id=`${file.name}:${file.size}:${file.lastModified}`;if(!next.some(d=>d.id===id)){const record={id,file,addedAt:Date.now()};next.push(record);libraryDB.put(record).catch(()=>{})}}return next});
    const last=valid[valid.length-1];setActiveId(`${last.name}:${last.size}:${last.lastModified}`);
  },[]);
  const active=documents.find(d=>d.id===activeId);
  const closeDocument=useCallback(id=>{
    libraryDB.remove(id).catch(()=>{});
    setDocuments(current=>{
      const index=current.findIndex(d=>d.id===id);const next=current.filter(d=>d.id!==id);
      if(id===activeId)setActiveId(next[Math.min(Math.max(index,0),next.length-1)]?.id||null);
      return next;
    });
  },[activeId]);
  if(!libraryReady)return <div className="app-loading"><LoaderCircle/><span>Restoring your library…</span></div>;
  return active?<Reader key={active.id} file={active.file} documents={documents} onOpenDocument={setActiveId} onAddDocument={addDocuments} onCloseDocument={closeDocument} onClose={()=>setActiveId(null)}/>:<EmptyState onFile={addDocuments} dragging={dragging} setDragging={setDragging}/>;
}

createRoot(document.getElementById('root')).render(<App/>);
