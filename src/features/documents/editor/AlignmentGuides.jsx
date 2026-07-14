export default function AlignmentGuides({ vertical, horizontal }) {
  return (
    <>
      {vertical !== null && (
        <div
          className="contract-alignment-guide vertical"
          style={{ left: vertical }}
        />
      )}
      {horizontal !== null && (
        <div
          className="contract-alignment-guide horizontal"
          style={{ top: horizontal }}
        />
      )}
    </>
  );
}
