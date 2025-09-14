import { Link } from "react-router-dom";

export default function Navbar() {
  const navStyle: React.CSSProperties = {
    display: "flex",
    gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid #eee",
    alignItems: "center",
  };

  const linkStyle: React.CSSProperties = { textDecoration: "none" };

  return (
    <nav style={navStyle}>
      <Link to="/" style={linkStyle}>
        <strong>MockBank</strong>
      </Link>
      <Link to="/" style={linkStyle}>
        Home
      </Link>
      <Link to="/login" style={linkStyle}>
        Login
      </Link>
      <Link to="/register" style={linkStyle}>
        Register
      </Link>
    </nav>
  );
}
