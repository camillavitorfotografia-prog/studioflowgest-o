import { ArrowUpRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function DashboardCard({
  title,
  value,
  description,
  icon: Icon,
  tone = 'gold',
  path,
}) {
  const navigate = useNavigate();
  const interactive = Boolean(path);

  const content = (
    <>
      <div className={`sf-dashboard-card-icon tone-${tone}`}>
        <Icon size={20} strokeWidth={1.9} />
      </div>
      <div className="sf-dashboard-card-copy">
        <span>{title}</span>
        <strong>{value}</strong>
        {description && <small>{description}</small>}
      </div>
      {interactive && <ArrowUpRight className="sf-dashboard-card-arrow" size={17} />}
    </>
  );

  if (!interactive) {
    return <article className="sf-dashboard-card">{content}</article>;
  }

  return (
    <button
      type="button"
      className="sf-dashboard-card sf-dashboard-card-button"
      onClick={() => navigate(path)}
    >
      {content}
    </button>
  );
}
