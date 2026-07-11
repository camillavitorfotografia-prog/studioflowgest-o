import { Loader2 } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/useAuth';

export default function ProtectedRoute({ children }) {
  const { loading, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="sf-auth-loading">
        <Loader2 size={28} />
      </div>
    );
  }

  if (!session?.user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location }}
      />
    );
  }

  return children;
}
