// Icon library for the toolbox (Lucide, MIT license). Rendered as inline SVG,
// so icons export to PNG exactly as shown.
import {
  User, Users, UserCheck, UserCog, Headset, Contact,
  Building2, Factory, Store, Warehouse, Landmark, Hospital, School, Handshake,
  Truck, Package, Boxes, ShoppingCart,
  FileText, ClipboardList, ClipboardCheck, Receipt, Printer, FolderOpen, Mail, Phone, MessageSquare,
  Laptop, Monitor, Smartphone, Server, Database, Cloud, Globe, Wifi,
  Banknote, CreditCard, Wallet, PiggyBank,
  Clock, Calendar, Timer, Hourglass,
  TriangleAlert, CircleCheck, CircleX, CircleHelp, Flag, ShieldCheck, Lock,
  Settings, Wrench, Search, ChartBar, ChartLine, Target, Lightbulb, Gauge, Recycle, Award,
  type LucideIcon,
} from "lucide-react";

export interface IconDef {
  label: string;
  group: IconGroup;
  Icon: LucideIcon;
  /** Extra search words. */
  tags?: string;
}

export const ICON_GROUPS = [
  "People",
  "Organizations",
  "Logistics",
  "Documents & comms",
  "Technology",
  "Money",
  "Time",
  "Status",
  "Improvement",
] as const;
export type IconGroup = (typeof ICON_GROUPS)[number];

export const ICONS = {
  user: { label: "User", group: "People", Icon: User, tags: "person customer employee" },
  users: { label: "Team", group: "People", Icon: Users, tags: "group people department" },
  approver: { label: "Approver", group: "People", Icon: UserCheck, tags: "manager sign-off" },
  admin: { label: "Admin", group: "People", Icon: UserCog, tags: "it support owner" },
  agent: { label: "Agent", group: "People", Icon: Headset, tags: "call center support helpdesk" },
  contact: { label: "Contact", group: "People", Icon: Contact, tags: "card vendor" },

  company: { label: "Company", group: "Organizations", Icon: Building2, tags: "office supplier customer business" },
  factory: { label: "Factory", group: "Organizations", Icon: Factory, tags: "plant manufacturing production" },
  store: { label: "Store", group: "Organizations", Icon: Store, tags: "shop retail branch" },
  warehouse: { label: "Warehouse", group: "Organizations", Icon: Warehouse, tags: "storage inventory" },
  bank: { label: "Bank", group: "Organizations", Icon: Landmark, tags: "government agency" },
  hospital: { label: "Hospital", group: "Organizations", Icon: Hospital, tags: "clinic health" },
  school: { label: "School", group: "Organizations", Icon: School, tags: "university training" },
  partner: { label: "Partner", group: "Organizations", Icon: Handshake, tags: "agreement deal vendor" },

  truck: { label: "Delivery", group: "Logistics", Icon: Truck, tags: "truck shipping transport" },
  package: { label: "Package", group: "Logistics", Icon: Package, tags: "box parcel product" },
  inventory: { label: "Inventory", group: "Logistics", Icon: Boxes, tags: "stock materials" },
  order: { label: "Order", group: "Logistics", Icon: ShoppingCart, tags: "cart purchase buy" },

  document: { label: "Document", group: "Documents & comms", Icon: FileText, tags: "file report form" },
  checklist: { label: "Checklist", group: "Documents & comms", Icon: ClipboardList, tags: "list tasks" },
  inspection: { label: "Inspection", group: "Documents & comms", Icon: ClipboardCheck, tags: "audit review qc" },
  invoice: { label: "Invoice", group: "Documents & comms", Icon: Receipt, tags: "receipt bill" },
  printer: { label: "Print", group: "Documents & comms", Icon: Printer },
  folder: { label: "Folder", group: "Documents & comms", Icon: FolderOpen, tags: "records files" },
  email: { label: "Email", group: "Documents & comms", Icon: Mail, tags: "mail notification" },
  phone: { label: "Phone", group: "Documents & comms", Icon: Phone, tags: "call" },
  chat: { label: "Chat", group: "Documents & comms", Icon: MessageSquare, tags: "message teams slack" },

  laptop: { label: "Laptop", group: "Technology", Icon: Laptop, tags: "computer pc" },
  monitor: { label: "System", group: "Technology", Icon: Monitor, tags: "screen app desktop" },
  mobile: { label: "Mobile", group: "Technology", Icon: Smartphone, tags: "phone app" },
  server: { label: "Server", group: "Technology", Icon: Server, tags: "backend host" },
  database: { label: "Database", group: "Technology", Icon: Database, tags: "db data storage" },
  cloud: { label: "Cloud", group: "Technology", Icon: Cloud, tags: "saas online" },
  web: { label: "Website", group: "Technology", Icon: Globe, tags: "internet portal" },
  network: { label: "Network", group: "Technology", Icon: Wifi, tags: "wifi internet" },

  cash: { label: "Cash", group: "Money", Icon: Banknote, tags: "money payment" },
  card: { label: "Card", group: "Money", Icon: CreditCard, tags: "payment credit" },
  wallet: { label: "Wallet", group: "Money", Icon: Wallet, tags: "budget" },
  savings: { label: "Savings", group: "Money", Icon: PiggyBank, tags: "cost reduction" },

  clock: { label: "Time", group: "Time", Icon: Clock, tags: "cycle time lead" },
  calendar: { label: "Schedule", group: "Time", Icon: Calendar, tags: "date deadline" },
  timer: { label: "Timer", group: "Time", Icon: Timer, tags: "sla" },
  waiting: { label: "Waiting", group: "Time", Icon: Hourglass, tags: "delay queue wait" },

  warning: { label: "Warning", group: "Status", Icon: TriangleAlert, tags: "risk issue problem defect" },
  done: { label: "Done", group: "Status", Icon: CircleCheck, tags: "ok pass approved" },
  rejected: { label: "Rejected", group: "Status", Icon: CircleX, tags: "fail error no" },
  question: { label: "Question", group: "Status", Icon: CircleHelp, tags: "unknown" },
  milestone: { label: "Milestone", group: "Status", Icon: Flag, tags: "goal" },
  compliance: { label: "Compliance", group: "Status", Icon: ShieldCheck, tags: "secure policy" },
  locked: { label: "Restricted", group: "Status", Icon: Lock, tags: "lock security" },

  settings: { label: "Settings", group: "Improvement", Icon: Settings, tags: "config process" },
  fix: { label: "Fix", group: "Improvement", Icon: Wrench, tags: "maintenance repair" },
  analyze: { label: "Analyze", group: "Improvement", Icon: Search, tags: "search investigate root cause" },
  metrics: { label: "Metrics", group: "Improvement", Icon: ChartBar, tags: "chart kpi measure" },
  trend: { label: "Trend", group: "Improvement", Icon: ChartLine, tags: "control chart spc" },
  target: { label: "Target", group: "Improvement", Icon: Target, tags: "goal ctq" },
  idea: { label: "Idea", group: "Improvement", Icon: Lightbulb, tags: "improve kaizen" },
  performance: { label: "Performance", group: "Improvement", Icon: Gauge, tags: "speed capacity" },
  reuse: { label: "Recycle", group: "Improvement", Icon: Recycle, tags: "rework loop" },
  quality: { label: "Quality", group: "Improvement", Icon: Award, tags: "best standard" },
} satisfies Record<string, IconDef>;

export type IconKey = keyof typeof ICONS;
export const ICON_KEYS = Object.keys(ICONS) as IconKey[];
export const DEFAULT_ICON: IconKey = "user";

export const isIconKey = (v: unknown): v is IconKey => typeof v === "string" && v in ICONS;

export function searchIcons(query: string): IconKey[] {
  const q = query.trim().toLowerCase();
  if (!q) return ICON_KEYS;
  return ICON_KEYS.filter((k) => {
    const d: IconDef = ICONS[k];
    return `${k} ${d.label} ${d.group} ${d.tags ?? ""}`.toLowerCase().includes(q);
  });
}
