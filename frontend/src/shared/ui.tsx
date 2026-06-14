export function DotBackground() {
  return (
    <div
      className="fixed inset-0 -z-10 bg-[#f7f8fa]"
      style={{
        backgroundImage: "radial-gradient(circle, #d4d7de 1px, transparent 1px)",
        backgroundSize: "22px 22px",
      }}
    />
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="bg-white rounded-2xl border border-gray-200/90 overflow-hidden"
      style={{
        boxShadow:
          "0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.02)",
      }}
    >
      {children}
    </div>
  );
}
