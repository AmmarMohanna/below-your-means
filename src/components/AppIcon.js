export default function AppIcon({ name, size = 22, ...props }) {
  const paths = {
    today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
    money: <><path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v11H6a3 3 0 0 1-3-3V6" /><path d="M20 12h-5v5h5" /><circle cx="16.5" cy="14.5" r=".5" /></>,
    life: <path d="M20.5 13.5A8.5 8.5 0 0 1 10.5 3a8.5 8.5 0 1 0 10 10.5Z" />,
    analytics: <><path d="M4 3v17h17M8 15l4-5 4 2 5-7" /><path d="M17 5h4v4" /></>,
    settings: <><path d="m9.5 3-.7 2.2-2 .9-2.2-.5-2 3.5 1.5 1.7v2.4l-1.5 1.7 2 3.5 2.2-.5 2 .9.7 2.2h5l.7-2.2 2-.9 2.2.5 2-3.5-1.5-1.7v-2.4l1.5-1.7-2-3.5-2.2.5-2-.9-.7-2.2Z" /><circle cx="12" cy="12" r="3" /></>,
  };

  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths[name] || paths.today}</svg>;
}
