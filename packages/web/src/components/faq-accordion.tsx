export default function FaqAccordion({
  items,
}: {
  items: { question: string; answer: string }[];
}) {
  return (
    <div className="divide-y divide-border">
      {items.map((item) => (
        <details key={item.question} className="group py-5">
          <summary className="cursor-pointer text-base font-semibold text-text-primary marker:text-primary">
            {item.question}
          </summary>
          <p className="mt-4 text-sm text-text-secondary leading-relaxed">
            {item.answer}
          </p>
        </details>
      ))}
    </div>
  );
}
