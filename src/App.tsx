import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

export default function App() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    invoke<string>("app_version")
      .then(setVersion)
      .catch(() => setVersion(null));
  }, []);

  return (
    <main className="shell">
      <h1>Grimoire</h1>
      <p>{version ? `v${version}` : "…"}</p>
    </main>
  );
}
