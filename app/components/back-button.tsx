'use client';
import { useRouter } from 'next/navigation';

export function BackButton() {
  const router = useRouter();
  const onClick = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/');
  };
  return (
    <button type="button" className="okf-back" onClick={onClick}>
      <span aria-hidden="true">←</span> Back
    </button>
  );
}
