export default function Template({ children }: { children: React.ReactNode }) {
  // Re-mounts on each navigation, so every page eases in.
  return <div className="rise">{children}</div>;
}
