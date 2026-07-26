export default function ProposalPageCanvas({
  page,
  assets,
  pricing,
  logo,
  onSelectImage,
  zoom = 1,
  packageOption = null,
}) {
  const packageDetails = packageOption?.proposalPackage || null;
  const fallbackPrice = pricing?.state?.recommendedPrice || pricing?.state?.valorFinal || '';

  return (
    <div className={`proposal-canvas type-${page.type}`} style={{ '--page-zoom': zoom }}>
      {page.imageSlots.map((slot, index) => {
        const asset = assets[slot.id];
        return (
          <button type="button" className={`proposal-image-slot slot-${index + 1}`} key={slot.id} onClick={() => onSelectImage(slot)}>
            {asset ? (
              <img src={asset.src} alt="" style={{ objectPosition: `${asset.x}% ${asset.y}%`, transform: `scale(${asset.zoom})`, opacity: asset.opacity }} />
            ) : (
              <span>Adicionar fotografia<br /><small>Proporção {slot.ratio}</small></span>
            )}
          </button>
        );
      })}

      <div className="proposal-overlay" />

      <div className="proposal-fixed-copy">
        {logo && <img className="proposal-logo" src={logo} alt="StudioFlow" />}
        {page.fixedTexts.map((text) => <p key={text}>{text}</p>)}
        <h2>{page.title}</h2>

        {page.dynamicBlocks.includes('packages') && !packageDetails && (
          <div className="proposal-package">
            <strong>{pricing?.state?.categoria || 'Precificação selecionada'}</strong>
            <span>{pricing?.state?.service || pricing?.state?.ensaioTipo || ''}</span>
            {fallbackPrice && <b>{fallbackPrice}</b>}
          </div>
        )}

        {packageDetails && (
          <div className="proposal-package detailed">
            <strong>{packageDetails.packageName}</strong>
            <b>{packageDetails.priceLabel}</b>
            <p>{packageDetails.description}</p>
            <ul>
              {(packageDetails.bullets || []).map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
