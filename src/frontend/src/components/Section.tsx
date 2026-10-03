import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

/** Content grouping without another card surface or inset padding. */
const Section = forwardRef<HTMLElement, HTMLAttributes<HTMLElement>>(function Section({ className = '', ...props }, ref) {
  return <section ref={ref} className={`content-section ${className}`} {...props} />;
});
export default Section;
