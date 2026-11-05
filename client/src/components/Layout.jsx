import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <>
      <header className="site-header">
        <Link to="/" className="brand">
          Salle Horizon
        </Link>
        <nav aria-label="Navigation principale">
          <NavLink to="/" end>
            Formules
          </NavLink>
          {user && <NavLink to="/espace">Mon espace</NavLink>}
          {user?.role === 'admin' && <NavLink to="/admin">Administration</NavLink>}
          {user ? (
            <button type="button" className="link-button" onClick={handleLogout}>
              Se deconnecter
            </button>
          ) : (
            <>
              <NavLink to="/connexion">Se connecter</NavLink>
              <NavLink to="/inscription">Creer un compte</NavLink>
            </>
          )}
        </nav>
      </header>
      <main className="page">
        <Outlet />
      </main>
      <footer className="site-footer">
        Projet de demonstration : salle fictive, donnees inventees, aucun vrai paiement.
      </footer>
    </>
  );
}
