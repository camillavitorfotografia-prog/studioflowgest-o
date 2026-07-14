import { useRef } from 'react';

export default function useDragResize() {
  const interactionRef = useRef(null);
  return interactionRef;
}
