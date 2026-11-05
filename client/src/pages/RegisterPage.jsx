import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import ErrorMessage from '../components/ErrorMessage.jsx';

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setIsSubmitting(true);
    setError(null);
    try {
      await register({
        fullName: form.get('fullName'),
        email: form.get('email'),
        password: form.get('password'),
      });
      navigate('/espace');
    } catch (submitError) {
      setError(submitError);
      setIsSubmitting(false);
    }
  }

  return (
    <section className="form-page">
      <h1>Créer un compte</h1>
      <ErrorMessage error={error} />
      <form onSubmit={handleSubmit}>
        <label>
          Nom complet
          <input name="fullName" autoComplete="name" required minLength={2} maxLength={100} />
        </label>
        <label>
          Adresse e-mail
          <input name="email" type="email" autoComplete="username" required />
        </label>
        <label>
          Mot de passe (10 caractères minimum)
          <input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={200} />
        </label>
        <button type="submit" className="button" disabled={isSubmitting}>
          Créer mon compte
        </button>
      </form>
      <p>
        Déjà un compte ? <Link to="/connexion">Se connecter</Link>
      </p>
    </section>
  );
}
