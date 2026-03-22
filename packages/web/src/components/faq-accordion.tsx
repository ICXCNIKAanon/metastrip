'use client';

import { useState } from 'react';

interface FaqItem {
  question: string;
  answer: string;
}

interface FaqAccordionProps {
  items: FaqItem[];
}

export default function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleToggle = (index: number) => {
    setOpenIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div>
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const isLast = index === items.length - 1;

        return (
          <div key={index} className={isLast ? '' : 'border-b border-border'}>
            <button
              type="button"
              id={`faq-question-${index}`}
              onClick={() => handleToggle(index)}
              aria-expanded={isOpen}
              aria-controls={`faq-answer-${index}`}
              className="w-full flex items-center justify-between gap-4 py-4 text-left"
            >
              <span className="text-lg font-semibold text-text-primary">
                {item.question}
              </span>
              <span
                className="flex-shrink-0 text-text-tertiary transition-transform duration-200"
                style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                aria-hidden="true"
              >
                ▼
              </span>
            </button>

            {/* Answer — smooth height transition via grid-rows */}
            <div
              id={`faq-answer-${index}`}
              role="region"
              aria-labelledby={`faq-question-${index}`}
              className="grid transition-all duration-200 ease-in-out"
              style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}
            >
              <div className="overflow-hidden">
                <p className="pb-4 text-text-secondary leading-relaxed">
                  {item.answer}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
