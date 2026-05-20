import type { Instruction } from "../../shared/types";

interface Props {
  instructions: Instruction[];
}

export default function InstructionList({ instructions }: Props) {
  return (
    <ol className="space-y-5">
      {instructions.map((inst, i) => (
        <li
          key={inst.id ?? i}
          className="flex gap-4 animate-slide-in"
          style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
        >
          <span className="text-ink-muted text-sm font-medium tabular-nums mt-0.5 shrink-0 w-6 text-right">
            {inst.step}.
          </span>
          <p className="text-[15px] text-ink leading-relaxed">{inst.text}</p>
        </li>
      ))}
    </ol>
  );
}
