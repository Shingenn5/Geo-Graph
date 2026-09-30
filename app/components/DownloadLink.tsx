"use client";

import { useEffect, useRef, useState } from "react";

export function useDownload() {
  const [file, setFile] = useState<{url:string;name:string}|null>(null);
  const current = useRef<string|null>(null);
  useEffect(() => () => { if (current.current) URL.revokeObjectURL(current.current); }, []);
  function download(body:string, mime:string, name:string) {
    if (current.current) URL.revokeObjectURL(current.current);
    const url = URL.createObjectURL(new Blob([body], {type:`${mime};charset=utf-8`}));
    current.current = url;
    setFile({url,name});
    // Keep a real link available if the browser blocks automatic blob downloads.
    const link = document.createElement("a");
    link.href = url; link.download = name;
    document.body.appendChild(link); link.click(); link.remove();
  }
  return {file,download};
}

export default function DownloadLink({file}:{file:{url:string;name:string}|null}) {
  if (!file) return null;
  return <p className="download-ready" role="status">Export ready. <a href={file.url} download={file.name}>Save {file.name}</a></p>;
}
