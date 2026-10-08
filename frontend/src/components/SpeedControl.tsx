import { SPEEDS, type AnimationSpeed } from "../flowAnimation";
import { SegButton, Segmented } from "./ui";

/** Slow / Normal / Fast for all animated arrows in the diagram. */
export default function SpeedControl({ value, onChange, label = "Animation speed" }: {
  value: AnimationSpeed;
  onChange: (speed: AnimationSpeed) => void;
  label?: string;
}) {
  return (
    <Segmented label={label}>
      {(Object.keys(SPEEDS) as AnimationSpeed[]).map((k) => (
        <SegButton
          key={k}
          pressed={value === k}
          onClick={() => onChange(k)}
          title={`${SPEEDS[k].label}: ${SPEEDS[k].loopMs / 1000}-second GIF loop`}
        >
          {SPEEDS[k].label}
        </SegButton>
      ))}
    </Segmented>
  );
}
