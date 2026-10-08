// Persona avatars: small, original flat illustrations drawn in SVG from a spec,
// so every persona can be customised (skin, hair, clothes, accessory, background).
import { useId } from "react";

export const SKIN_TONES = ["#F6D7C3", "#E8B894", "#C98E62", "#9A6440", "#5E3B26"] as const;
export const HAIR_COLORS = ["#1F1A17", "#4A3222", "#8A5A36", "#D9B26A", "#A8A8A8", "#9C3F1E"] as const;
export const SHIRT_COLORS = ["#2F5D7C", "#1F3A52", "#5B7F6E", "#C0782B", "#7A4E6B", "#4F4F57", "#2E8B8B", "#D4A72C"] as const;
export const AVATAR_BGS = ["#E1EBF4", "#E4EFE8", "#F6EDD6", "#F1E4EC", "#F7DEDA", "#ECEFF1"] as const;

export const HAIR_STYLES = ["short", "long", "bun", "curly", "bald"] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const ACCESSORIES = ["none", "glasses", "tie", "headset", "hardhat", "cap"] as const;
export type Accessory = (typeof ACCESSORIES)[number];

export const HAIR_LABEL: Record<HairStyle, string> = {
  short: "Short", long: "Long", bun: "Bun", curly: "Curly", bald: "Bald",
};
export const ACCESSORY_LABEL: Record<Accessory, string> = {
  none: "None", glasses: "Glasses", tie: "Tie", headset: "Headset", hardhat: "Hard hat", cap: "Cap",
};

export type AvatarSpec = {
  skin: number;
  hair: HairStyle;
  hairColor: number;
  shirt: number;
  accessory: Accessory;
  bg: number;
};

export const DEFAULT_AVATAR: AvatarSpec = { skin: 1, hair: "short", hairColor: 1, shirt: 0, accessory: "none", bg: 0 };

const pick = <T,>(arr: readonly T[], i: number): T => arr[((i % arr.length) + arr.length) % arr.length] as T;

/** Accept anything from saved data and return a valid spec. */
export function normalizeAvatar(v: unknown): AvatarSpec {
  const o = (v && typeof v === "object" ? v : {}) as Partial<AvatarSpec>;
  const num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) ? Math.trunc(x) : d);
  return {
    skin: num(o.skin, DEFAULT_AVATAR.skin),
    hair: HAIR_STYLES.includes(o.hair as HairStyle) ? (o.hair as HairStyle) : DEFAULT_AVATAR.hair,
    hairColor: num(o.hairColor, DEFAULT_AVATAR.hairColor),
    shirt: num(o.shirt, DEFAULT_AVATAR.shirt),
    accessory: ACCESSORIES.includes(o.accessory as Accessory) ? (o.accessory as Accessory) : "none",
    bg: num(o.bg, DEFAULT_AVATAR.bg),
  };
}

export function Avatar({ spec, title }: { spec: AvatarSpec; title?: string }) {
  const clip = useId();
  const skin = pick(SKIN_TONES, spec.skin);
  const hair = pick(HAIR_COLORS, spec.hairColor);
  const shirt = pick(SHIRT_COLORS, spec.shirt);
  const bg = pick(AVATAR_BGS, spec.bg);

  return (
    <svg viewBox="0 0 64 64" className="avatar" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <clipPath id={clip}><circle cx="32" cy="32" r="31" /></clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="64" height="64" fill={bg} />
        {/* hair behind the head */}
        {spec.hair === "long" && <path d="M17,30 C17,14 47,14 47,30 V52 H17 Z" fill={hair} />}
        {/* body */}
        <path d="M8,66 C8,50 19,44 32,44 C45,44 56,50 56,66 Z" fill={shirt} />
        <path d="M27,40 H37 V47 C35,49 29,49 27,47 Z" fill={skin} />
        <path d="M27,45 L32,51 L37,45" fill="none" stroke="#ffffff" strokeOpacity=".55" strokeWidth="1.4" />
        {spec.accessory === "tie" && <path d="M32,47 L29.6,50 L32,60 L34.4,50 Z" fill="#B23A2F" />}
        {/* head */}
        <ellipse cx="32" cy="29" rx="11" ry="12.5" fill={skin} />
        <ellipse cx="20.8" cy="30" rx="1.8" ry="2.6" fill={skin} />
        <ellipse cx="43.2" cy="30" rx="1.8" ry="2.6" fill={skin} />
        {/* face */}
        <circle cx="27.8" cy="29.5" r="1.25" fill="#1F1A17" />
        <circle cx="36.2" cy="29.5" r="1.25" fill="#1F1A17" />
        <path d="M28.5,35 Q32,37.8 35.5,35" fill="none" stroke="#1F1A17" strokeWidth="1.2" strokeLinecap="round" />
        {/* hair on top */}
        {spec.hair === "short" && <path d="M20.6,27 C20,15 44,14 43.4,27 C41,21 35,19.5 29,20.5 C25,21.2 22,23.5 20.6,27 Z" fill={hair} />}
        {spec.hair === "long" && <path d="M20.5,29 C19.5,15 44.5,15 43.5,29 C40,22 33,20 26,22 C23.5,23 21.5,25.5 20.5,29 Z" fill={hair} />}
        {spec.hair === "bun" && (
          <>
            <circle cx="32" cy="13.5" r="5" fill={hair} />
            <path d="M20.8,27 C20.5,15 43.5,15 43.2,27 C40,20.5 24,20.5 20.8,27 Z" fill={hair} />
          </>
        )}
        {spec.hair === "curly" && (
          <g fill={hair}>
            <circle cx="22.5" cy="24" r="4.2" /><circle cx="26.5" cy="19" r="4.6" /><circle cx="32" cy="17" r="4.8" />
            <circle cx="37.5" cy="19" r="4.6" /><circle cx="41.5" cy="24" r="4.2" />
          </g>
        )}
        {spec.hair === "bald" && <path d="M22,26 C22.5,23 24,21.5 25,21 M42,26 C41.5,23 40,21.5 39,21" fill="none" stroke={hair} strokeWidth="1.6" strokeLinecap="round" />}
        {/* accessories */}
        {spec.accessory === "glasses" && (
          <g fill="none" stroke="#1F1A17" strokeWidth="1.2">
            <circle cx="27.8" cy="29.5" r="3.4" /><circle cx="36.2" cy="29.5" r="3.4" /><path d="M31.2,29.3 H32.8" />
          </g>
        )}
        {spec.accessory === "headset" && (
          <g>
            <path d="M19.5,30 C19.5,12 44.5,12 44.5,30" fill="none" stroke="#2A2F36" strokeWidth="2.2" />
            <rect x="17.3" y="27" width="4.4" height="7.5" rx="2" fill="#2A2F36" />
            <rect x="42.3" y="27" width="4.4" height="7.5" rx="2" fill="#2A2F36" />
            <path d="M20,34 C21,38.5 25,39.5 28.5,38.5" fill="none" stroke="#2A2F36" strokeWidth="1.5" />
            <circle cx="29" cy="38.3" r="1.4" fill="#2A2F36" />
          </g>
        )}
        {spec.accessory === "hardhat" && (
          <g>
            <path d="M19.5,24 C19.5,10.5 44.5,10.5 44.5,24 Z" fill="#F2C230" />
            <rect x="16.5" y="22.5" width="31" height="3.4" rx="1.7" fill="#E0AE1C" />
            <path d="M32,11.5 V22.5" stroke="#E0AE1C" strokeWidth="2" />
          </g>
        )}
        {spec.accessory === "cap" && (
          <g>
            <path d="M20.5,24.5 C20.5,12 43.5,12 43.5,24.5 Z" fill={shirt} />
            <path d="M40,23.5 C44,23 49,23.5 50.5,25 C47,26.2 42.5,26 40,25.2 Z" fill={shirt} />
            <path d="M20.5,24.5 H43.5" stroke="#000" strokeOpacity=".18" strokeWidth="1.2" />
          </g>
        )}
      </g>
    </svg>
  );
}

// Ready-made personas for the toolbox. Label = default role/caption.
export const PERSONA_PRESETS = {
  customer: { label: "Customer", spec: { skin: 1, hair: "long", hairColor: 2, shirt: 6, accessory: "none", bg: 0 } },
  manager: { label: "Manager", spec: { skin: 0, hair: "short", hairColor: 0, shirt: 1, accessory: "tie", bg: 5 } },
  staff: { label: "Staff", spec: { skin: 2, hair: "bun", hairColor: 0, shirt: 2, accessory: "none", bg: 1 } },
  engineer: { label: "Engineer", spec: { skin: 1, hair: "short", hairColor: 1, shirt: 3, accessory: "hardhat", bg: 2 } },
  agent: { label: "Support agent", spec: { skin: 3, hair: "curly", hairColor: 0, shirt: 4, accessory: "headset", bg: 3 } },
  driver: { label: "Driver", spec: { skin: 2, hair: "short", hairColor: 0, shirt: 0, accessory: "cap", bg: 0 } },
  analyst: { label: "Analyst", spec: { skin: 0, hair: "long", hairColor: 5, shirt: 2, accessory: "glasses", bg: 4 } },
  itadmin: { label: "IT admin", spec: { skin: 1, hair: "short", hairColor: 0, shirt: 5, accessory: "glasses", bg: 0 } },
  approver: { label: "Approver", spec: { skin: 4, hair: "short", hairColor: 0, shirt: 5, accessory: "tie", bg: 2 } },
  supplier: { label: "Supplier rep", spec: { skin: 1, hair: "bun", hairColor: 3, shirt: 3, accessory: "none", bg: 3 } },
  student: { label: "Student", spec: { skin: 2, hair: "curly", hairColor: 1, shirt: 7, accessory: "none", bg: 1 } },
  senior: { label: "Senior", spec: { skin: 0, hair: "bald", hairColor: 4, shirt: 2, accessory: "glasses", bg: 5 } },
} satisfies Record<string, { label: string; spec: AvatarSpec }>;

export type PersonaPresetKey = keyof typeof PERSONA_PRESETS;
export const PERSONA_PRESET_KEYS = Object.keys(PERSONA_PRESETS) as PersonaPresetKey[];
export const isPresetKey = (v: unknown): v is PersonaPresetKey => typeof v === "string" && v in PERSONA_PRESETS;
