import { useEffect, useState } from "react";
import { api, type AppInfo } from "./lib/api";
import "./App.css";

// Pantalla provisional hasta la fase 2: confirma que el backend y la base de
// datos responden.
export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [books, setBooks] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.appInfo(), api.listBooks()])
      .then(([appInfo, list]) => {
        setInfo(appInfo);
        setBooks(list.length);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="shell">
      <h1>Grimoire</h1>
      {error ? (
        <p>{error}</p>
      ) : (
        <>
          <p>{info ? `v${info.version} · ${books} libros` : "…"}</p>
          {info && <p className="path">{info.dataDir}</p>}
        </>
      )}
    </main>
  );
}
