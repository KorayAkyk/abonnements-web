import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import AccountPage from './pages/AccountPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import HomePage from './pages/HomePage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import PaymentReturnPage from './pages/PaymentReturnPage.jsx';
import RegisterPage from './pages/RegisterPage.jsx';
import SimulatorPage from './pages/SimulatorPage.jsx';

function Protected({ children, adminOnly = false }) {
  const { user, isLoading } = useAuth();
  if (isLoading) {
    return <p role="status">Chargement...</p>;
  }
  if (!user) {
    return <Navigate to="/connexion" replace />;
  }
  if (adminOnly && user.role !== 'admin') {
    return (
      <p role="alert" className="alert alert-error">
        Cette page est reservee a l'administration.
      </p>
    );
  }
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="connexion" element={<LoginPage />} />
        <Route path="inscription" element={<RegisterPage />} />
        <Route path="espace" element={<Protected><AccountPage /></Protected>} />
        <Route path="simulateur/:checkoutId" element={<Protected><SimulatorPage /></Protected>} />
        <Route path="paiement/retour" element={<Protected><PaymentReturnPage /></Protected>} />
        <Route path="admin" element={<Protected adminOnly><AdminPage /></Protected>} />
        <Route path="*" element={<p>Cette page n'existe pas.</p>} />
      </Route>
    </Routes>
  );
}
