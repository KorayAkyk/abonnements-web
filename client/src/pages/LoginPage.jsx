import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setError(null);
    try {
      const user = await login({ email: form.get('email'), password: form.get('password') });
      navigate(user.role === 'admin' ? '/admin' : '/espace');
    } catch (submitError) {
      setError(submitError);
      setIsSubmitting(false);
    }
  }

  return (
    <section className="form-page">
      <h1>Se connecter</h1>
      <ErrorMessage error={error} />
      <form onSubmit={handleSubmit}>
        <label>
          Adresse e-mail
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Mot de passe
          <input name="password" type="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="button" disabled={isSubmitting}>
          Se connecter
        </button>
      </form>
      <p>
        Pas encore de compte ? <Link to="/inscription">Créer un compte</Link>
      </p>
    </section>
  );
}
