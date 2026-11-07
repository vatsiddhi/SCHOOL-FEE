import { useEffect, useState } from "react";

type Row = { id: string; admissionNo: string; name: string; outstandingPaise: number };
const inr = (p: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(p / 100);

export default function App() {
  const [rows, setRows] = useState<Row[]>([]);
  useEffect(() => {
    fetch("/api/students", { headers: { "x-institution-code": "demo-school" } })
      .then(r => r.json()).then(setRows);
  }, []);
  return (
    <main style={{ fontFamily: "system-ui", padding: 24 }}>
      <h1>FeeDesk · Demo Public School</h1>
      <table cellPadding={8}>
        <thead><tr><th>Adm. No</th><th>Student</th><th>Outstanding</th></tr></thead>
        <tbody>{rows.map(r => (
          <tr key={r.id}><td>{r.admissionNo}</td><td>{r.name}</td><td>{inr(r.outstandingPaise)}</td></tr>
        ))}</tbody>
      </table>
    </main>
  );
}
