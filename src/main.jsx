import React, { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import HTMLFlipBook from 'react-pageflip';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
  BookOpen, ChevronLeft, ChevronRight, Download, Expand, FileText,
  Grid2X2, Library, List, LoaderCircle, Minus, Moon, MoreHorizontal,
  PanelLeftClose, PanelLeftOpen, Palette, Plus, RotateCcw, Search, Sun, Upload, X
} from 'lucide-react';
import './styles.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

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
        <input ref={input} type="file" accept="application/pdf,.pdf" onChange={e => onFile(e.target.files[0])}/>
        <span className="upload-icon"><Upload size={25}/></span>
        <strong>Drop a PDF here</strong>
        <span>or click to choose from your device</span>
        <button>Choose PDF</button>
      </div>
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
  const canvas = useRef();
  useEffect(() => {
    if (!pdf || number < 1 || number > pdf.numPages) return;
    let cancelled = false, task;
    pdf.getPage(number).then(page => {
      if (cancelled) return;
      const base = page.getViewport({ scale: 1 });
      const desired = thumb ? 150 : Math.min(1400, Math.max(520, window.innerHeight * .72)) * scale;
      const viewport = page.getViewport({ scale: desired / base.height });
      const c = canvas.current, ratio = Math.min(window.devicePixelRatio || 1, 2);
      c.width = viewport.width * ratio; c.height = viewport.height * ratio;
      c.style.aspectRatio = `${viewport.width}/${viewport.height}`;
      const ctx = c.getContext('2d', { alpha: false });
      task = page.render({ canvasContext: ctx, viewport, transform: ratio === 1 ? null : [ratio,0,0,ratio,0,0] });
      task.promise.then(() => !cancelled && onReady?.()).catch(error => {
        if (!cancelled && error?.name !== 'RenderingCancelledException') onError?.(error);
      });
    }).catch(error => !cancelled && onError?.(error));
    return () => { cancelled = true; task?.cancel() };
  }, [pdf, number, scale, thumb]);
  return <canvas ref={canvas} className={thumb ? 'thumb-canvas' : 'page-canvas'} />;
}

const FlipPage = forwardRef(function FlipPage({pdf, number, scale, onError}, ref) {
  return <div ref={ref} className="flip-page">
    <PageCanvas pdf={pdf} number={number} scale={scale} onError={onError}/>
    <span className="page-num">{number}</span>
  </div>;
});

function Sidebar({ pdf, current, go, open, tab, setTab, searchIndex }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => {
    if (query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return searchIndex.map((text, i) => ({ i: i + 1, text, at: text.toLowerCase().indexOf(q) }))
      .filter(x => x.at >= 0).slice(0, 50);
  }, [query, searchIndex]);
  if (!open || !pdf) return null;
  return <aside className="sidebar">
    <div className="side-tabs">
      <button className={tab==='pages'?'active':''} onClick={()=>setTab('pages')}><Grid2X2 size={16}/> Pages</button>
      <button className={tab==='search'?'active':''} onClick={()=>setTab('search')}><Search size={16}/> Search</button>
    </div>
    {tab === 'search' ? <div className="search-pane">
      <div className="search-input"><Search size={16}/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search this document…"/>{query&&<X size={15} onClick={()=>setQuery('')}/>}</div>
      {query.length < 2 ? <p className="hint">Enter at least 2 characters to search every page.</p> :
       results.length ? <div className="results">{results.map(r => <button key={r.i} onClick={()=>go(r.i)}><b>Page {r.i}</b><span>…{r.text.slice(Math.max(0,r.at-38),r.at+80)}…</span></button>)}</div> : <p className="hint">No results found.</p>}
    </div> : <div className="thumbs">{Array.from({length: pdf.numPages},(_,i)=>i+1).map(n=><button key={n} className={current===n?'current':''} onClick={()=>go(n)}><PageCanvas pdf={pdf} number={n} scale={1} thumb/><span>{n}</span></button>)}</div>}
  </aside>
}

function Reader({ file, onClose, documents, onOpenDocument, onAddDocument, onCloseDocument }) {
  const [pdf, setPdf] = useState(null), [page, setPage] = useState(1), [zoom, setZoom] = useState(1);
  const [sidebar, setSidebar] = useState(true), [tab, setTab] = useState('pages'), [spread, setSpread] = useState(true);
  const [dark, setDark] = useState(false), [grayscale, setGrayscale] = useState(false), [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [libraryOpen, setLibraryOpen] = useState(false), [libraryQuery, setLibraryQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState([]); const rootRef = useRef(), bookRef = useRef(), addFileRef = useRef();
  const downloadUrl = useMemo(() => URL.createObjectURL(file), [file]);
  const maxPage = pdf?.numPages || 1;
  const readProgress = maxPage > 1 ? (page - 1) / (maxPage - 1) : .5;
  useEffect(() => () => URL.revokeObjectURL(downloadUrl), [downloadUrl]);
  useEffect(() => {
    let dead = false, task;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        task = pdfjsLib.getDocument({data: bytes, useWorkerFetch: false});
        const doc = await task.promise; if(dead)return;
        setPdf(doc); setLoading(false); const key=`folio:${file.name}:${file.size}`; setPage(Math.min(+(localStorage.getItem(key)||1),doc.numPages));
        Promise.all(Array.from({length:doc.numPages},async(_,i)=>(await (await doc.getPage(i+1)).getTextContent()).items.map(x=>x.str).join(' '))).then(x=>!dead&&setSearchIndex(x)).catch(()=>{});
      } catch (reason) {
        if (!dead) { setLoading(false); setError(reason?.name === 'PasswordException' ? 'This PDF is password protected.' : `Could not open this PDF${reason?.message ? `: ${reason.message}` : '.'}`); }
      }
    };
    load(); return()=>{dead=true;task?.destroy()};
  }, [file]);
  useEffect(()=>{localStorage.setItem(`folio:${file.name}:${file.size}`,String(page))},[page,file]);
  const go = useCallback(n => {
    const next=Math.max(1,Math.min(maxPage,n)); if(next===page)return;
    const engine=bookRef.current?.pageFlip?.();
    if(!engine){setPage(next);return}
    if(next>page && next-page<=2) engine.flipNext();
    else if(next<page && page-next<=2) engine.flipPrev();
    else engine.turnToPage(next-1);
  },[page,maxPage]);
  useEffect(()=>{const fn=e=>{if(e.target.tagName==='INPUT')return;if(e.key==='ArrowRight'||e.key==='PageDown')go(page+(spread?2:1));if(e.key==='ArrowLeft'||e.key==='PageUp')go(page-(spread?2:1));if(e.key==='Home')go(1);if(e.key==='End')go(maxPage);if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();setSidebar(true);setTab('search')}};addEventListener('keydown',fn);return()=>removeEventListener('keydown',fn)},[go,page,spread,maxPage]);
  return <div ref={rootRef} className={`reader ${dark?'dark':''} ${grayscale?'grayscale':''}`}>
    <header className="reader-header">
      <div className="brand compact"><span className="brand-mark"><BookOpen size={17}/></span> Folio</div>
      <div className="doc-title"><FileText size={16}/><span>{file.name.replace(/\.pdf$/i,'')}</span><small>{maxPage} pages</small></div>
      <div className="header-actions">
        <IconButton label="Document library" active={libraryOpen} onClick={()=>setLibraryOpen(!libraryOpen)}><Library/></IconButton>
        <IconButton label={grayscale?'Show original colors':'Show in grayscale'} active={grayscale} onClick={()=>setGrayscale(!grayscale)}><Palette/></IconButton>
        <IconButton label="Toggle theme" onClick={()=>setDark(!dark)}>{dark?<Sun/>:<Moon/>}</IconButton>
        <IconButton label="Fullscreen" onClick={()=>document.fullscreenElement?document.exitFullscreen():rootRef.current.requestFullscreen()}><Expand/></IconButton>
        <IconButton label="Close document" onClick={onClose}><X/></IconButton>
      </div>
      {libraryOpen&&<div className="document-library">
        <div className="library-heading"><div><strong>Your PDFs</strong><small>{documents.length} document{documents.length===1?'':'s'} this session</small></div><IconButton label="Close library" onClick={()=>setLibraryOpen(false)}><X/></IconButton></div>
        <div className="library-search"><Search/><input value={libraryQuery} onChange={e=>setLibraryQuery(e.target.value)} placeholder="Find a loaded PDF…"/></div>
        <div className="library-list">{documents.filter(d=>d.file.name.toLowerCase().includes(libraryQuery.toLowerCase())).map(d=><div key={d.id} className={`library-row ${d.file===file?'selected':''}`}><button className="open-doc" onClick={()=>{onOpenDocument(d.id);setLibraryOpen(false)}}><span className="library-file-icon"><FileText/></span><span><strong>{d.file.name.replace(/\.pdf$/i,'')}</strong><small>{(d.file.size/1048576).toFixed(1)} MB {d.file===file?'· Reading now':''}</small></span><ChevronRight/></button><button className="remove-doc" title={`Close ${d.file.name}`} aria-label={`Close ${d.file.name}`} onClick={()=>onCloseDocument(d.id)}><X/></button></div>)}</div>
        <input ref={addFileRef} hidden type="file" multiple accept="application/pdf,.pdf" onChange={e=>{onAddDocument([...e.target.files]);e.target.value='';setLibraryOpen(false)}}/>
        <button className="add-pdf" onClick={()=>addFileRef.current.click()}><Plus/> Open more PDFs</button>
        <p>Files stay in this browser session and never leave your device.</p>
      </div>}
    </header>
    <div className="reader-body">
      <Sidebar {...{pdf,current:page,go,open:sidebar,tab,setTab,searchIndex}}/>
      <section className="stage">
        <div className="stage-top">
          <IconButton label="Toggle sidebar" active={sidebar} onClick={()=>setSidebar(!sidebar)}>{sidebar?<PanelLeftClose/>:<PanelLeftOpen/>}</IconButton>
          <span className="stage-label">{spread?'SPREAD VIEW':'SINGLE PAGE'}</span>
          <div className="view-switch"><IconButton label="Single page" active={!spread} onClick={()=>setSpread(false)}><FileText/></IconButton><IconButton label="Spread view" active={spread} onClick={()=>setSpread(true)}><BookOpen/></IconButton></div>
        </div>
        <button className="page-arrow left" disabled={page===1} onClick={()=>go(page-(spread?2:1))}><ChevronLeft/></button>
        {loading ? <div className="loading"><LoaderCircle/><span>Opening your PDF…</span></div> : error ? <div className="load-error"><FileText/><strong>We couldn't open this file</strong><span>{error}</span><button onClick={onClose}>Choose another PDF</button></div> : <div className={`flipbook-wrap ${spread?'is-spread':'is-single'}`} style={{'--zoom':zoom,'--left-stack':`${3+readProgress*12}px`,'--right-stack':`${3+(1-readProgress)*12}px`,'--left-shadow':`${8+readProgress*20}px`,'--right-shadow':`${8+(1-readProgress)*20}px`}}>
          <HTMLFlipBook key={spread?'spread':'single'} ref={bookRef} width={520} height={720} size="stretch" minWidth={260} maxWidth={620} minHeight={360} maxHeight={820} showCover={false} showPageCorners={false} usePortrait={!spread} drawShadow={true} maxShadowOpacity={.55} flippingTime={280} mobileScrollSupport={true} clickEventForward={false} useMouseEvents={false} startPage={Math.max(0,page-1)} onFlip={e=>setPage(e.data+1)} className="natural-book">
            {Array.from({length:maxPage},(_,i)=><FlipPage key={i+1} pdf={pdf} number={i+1} scale={1} onError={e=>setError(`Page rendering failed: ${e.message}`)}/>)}
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
  const [documents,setDocuments]=useState([]),[activeId,setActiveId]=useState(null),[dragging,setDragging]=useState(false);
  const addDocuments=useCallback(files=>{
    const valid=(Array.isArray(files)?files:[files]).filter(f=>f&&(f.type==='application/pdf'||f.name?.toLowerCase().endsWith('.pdf')));
    if(!valid.length)return;
    setDocuments(current=>{const next=[...current];for(const file of valid){const id=`${file.name}:${file.size}:${file.lastModified}`;if(!next.some(d=>d.id===id))next.push({id,file})}return next});
    const last=valid[valid.length-1];setActiveId(`${last.name}:${last.size}:${last.lastModified}`);
  },[]);
  const active=documents.find(d=>d.id===activeId);
  const closeDocument=useCallback(id=>{
    setDocuments(current=>{
      const index=current.findIndex(d=>d.id===id);const next=current.filter(d=>d.id!==id);
      if(id===activeId)setActiveId(next[Math.min(Math.max(index,0),next.length-1)]?.id||null);
      return next;
    });
  },[activeId]);
  return active?<Reader key={active.id} file={active.file} documents={documents} onOpenDocument={setActiveId} onAddDocument={addDocuments} onCloseDocument={closeDocument} onClose={()=>setActiveId(null)}/>:<EmptyState onFile={addDocuments} dragging={dragging} setDragging={setDragging}/>;
}

createRoot(document.getElementById('root')).render(<App/>);
