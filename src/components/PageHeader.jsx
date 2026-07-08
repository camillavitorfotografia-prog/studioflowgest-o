// src/components/PageHeader.jsx
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PageHeader({ title, subtitle }) {
  const navigate = useNavigate();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
      <button 
        onClick={() => navigate(-1)}
        style={{ 
          backgroundColor: 'transparent', color: '#888', border: '1px solid #333', 
          padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: '8px', transition: '0.2s' 
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#c9a06c'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#333'; }}
      >
        <ArrowLeft size={18} />
      </button>

      <div>
        <h1 style={{ color: '#fff', fontSize: '1.8rem', margin: 0 }}>{title}</h1>
        <p style={{ color: '#888', margin: 0 }}>{subtitle}</p>
      </div>
    </div>
  );
}
