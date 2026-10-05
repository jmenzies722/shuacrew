import { useEffect, useState } from "react";
export function SelectedAreaPreview({file,width,height,onClear}:{file:File;width:number;height:number;onClear:()=>void}) {
  const [url,setURL]=useState("");
  useEffect(()=>{const next=URL.createObjectURL(file);setURL(next);return()=>URL.revokeObjectURL(next);},[file]);
  return <div className="selected-area-preview" aria-label="Selected screen crop">
    {url && <img src={url} alt="The exact screen area selected for Shua to read" />}
    <span>Selected area<small>{width} × {height} · crop only</small></span>
    <button type="button" onClick={onClear} aria-label="Clear selected area">×</button>
  </div>;
}
