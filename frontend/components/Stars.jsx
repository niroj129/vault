export default function Stars({ value = 0, size = 14 }) {
  const full = Math.round(value);
  return (
    <span style={{ color: "#F5C542", fontSize: size, letterSpacing: 1 }} aria-label={`${value} out of 5`}>
      {"★".repeat(full)}<span style={{ color: "#3a3f52" }}>{"★".repeat(5 - full)}</span>
    </span>
  );
}
