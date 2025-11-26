// Unified theme configuration inspired by voice mode design system and dashboard aesthetics

export const theme = {
  // Background colors with elegant dark theme
  background: {
    // Main app background with sophisticated dark gradient
    primary: "bg-gradient-to-br from-gray-900 via-gray-950 to-black",
    // Hero sections with radial gradient
    hero: "bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,hsl(var(--muted)/0.15)_0%,transparent_70%)]",
    // Section backgrounds with subtle variation
    section: "bg-[linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--muted)/0.2)_50%,hsl(var(--background))_100%)]",
    // Modal backgrounds
    modal: "bg-black/60 backdrop-blur-sm",
  },

  // Enhanced glass components with dark theme aesthetics
  glass: {
    // Primary glass containers - elegant dark cards
    primary: "backdrop-blur-xl bg-white/5 border border-white/10 transition-all duration-200 hover:border-white/20 hover:bg-white/10",
    // Secondary glass (less prominent)
    secondary: "backdrop-blur-lg bg-white/3 border border-white/5 transition-all duration-200",
    // Sidebar glass with beautiful dark separation
    sidebar: "backdrop-blur-2xl bg-gradient-to-b from-black/40 via-gray-900/50 to-black/60 border-r border-white/10",
    // Elevated cards with subtle shadow
    elevated: "backdrop-blur-xl bg-white/8 border border-white/15 shadow-[0_1px_3px_0_rgb(255,255,255,0.05),0_1px_2px_-1px_rgb(255,255,255,0.05)] hover:shadow-[0_4px_6px_-1px_rgb(255,255,255,0.08),0_2px_4px_-2px_rgb(255,255,255,0.08)] hover:translate-y-[-1px] transition-all duration-200",
    // Terminal-style cards with enhanced shadow
    terminal: "backdrop-blur-xl bg-white/6 border border-white/12 shadow-[0_20px_25px_-5px_rgb(0,0,0,0.1),0_8px_10px_-6px_rgb(0,0,0,0.1)] hover:translate-y-[-2px] hover:shadow-[0_25px_50px_-12px_rgb(0,0,0,0.25)] transition-all duration-300",
    // Hover states
    hover: "hover:bg-white/15",
    // Active/selected states
    active: "bg-white/15 backdrop-blur-xl border-white/20",
  },

  // Text hierarchy from voice mode design system
  text: {
    // Primary text - foreground color
    primary: "text-white",
    // Secondary text - 70% opacity
    secondary: "text-white/70",
    // Tertiary text - muted foreground
    tertiary: "text-white/60",
    // Quaternary text - muted foreground with reduced opacity
    quaternary: "text-white/40",
    // Legacy compatibility
    muted: "text-white/60",
    subtle: "text-white/40",
  },

  // Enhanced typography from voice mode
  typography: {
    // Display text for headers - using font-bold (700)
    display: "font-bold tracking-tight leading-[0.95] [-letter-spacing:0.04em]",
    // Large display text - using font-black (900) for maximum impact
    displayLarge: "font-black tracking-tighter leading-[0.9] [-letter-spacing:0.05em]",
    // Medium headers - using font-semibold (600)
    heading: "font-semibold tracking-tight leading-tight [-letter-spacing:0.02em]",
    // Subheadings - using font-medium (500)
    subheading: "font-medium leading-relaxed [-letter-spacing:0.01em]",
    // Body text - using font-normal (400)
    body: "font-normal leading-relaxed [-letter-spacing:0.01em]",
    // Caption text - using font-light (300)
    caption: "font-light tracking-wide leading-normal",
    // Fine print - using font-thin (100) for subtle text
    fine: "font-thin tracking-wider leading-relaxed",
    // Balanced text wrapping
    balance: "[text-wrap:balance]",
  },

  // Enhanced shadows
  shadow: {
    sm: "shadow-sm",
    md: "shadow-md", 
    lg: "shadow-lg",
    xl: "shadow-xl",
    "2xl": "shadow-2xl",
  },

  // Border radius with more options
  radius: {
    sm: "rounded-sm",
    md: "rounded-md",
    lg: "rounded-lg",
    xl: "rounded-xl",
    "2xl": "rounded-2xl",
    "3xl": "rounded-3xl",
  },

  // Enhanced button styles
  button: {
    primary: "backdrop-blur-lg bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:border-white/30 transition-all duration-200 font-medium",
    secondary: "text-white/60 hover:text-white/90 hover:bg-white/10 transition-all duration-200",
    outline: "border border-white/20 text-white/80 hover:text-white hover:bg-white/10 hover:border-white/30 transition-all duration-200",
  },

    // Input styles
  input: "bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/30 transition-all duration-200",

  // Navigation styles
  nav: {
    item: "w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-left",
    active: "text-white bg-white/20 backdrop-blur-xl shadow-lg",
    inactive: "text-white/80 hover:text-white hover:bg-white/10 hover:backdrop-blur-lg",
  },

  // Animation utilities from voice mode
  animation: {
    fadeIn: "animate-[fade-in_0.6s_ease-out_forwards] opacity-0",
    float: "animate-[float_3s_ease-in-out_infinite]",
    glow: "animate-[glow_2s_ease-in-out_infinite]",
    shimmer: "animate-[shimmer_2s_ease-in-out_infinite]",
  },

  // Section dividers
  divider: "bg-[linear-gradient(90deg,transparent_0%,hsl(var(--border))_50%,transparent_100%)] h-px mx-auto",
};

// Helper function to combine theme classes
export const getThemeClasses = (...classes: string[]) => {
  return classes.join(" ");
};

// Enhanced theme components with voice mode aesthetics
export const themeComponents = {
  // Container backgrounds
  container: theme.background.primary,
  sidebar: theme.glass.sidebar,

  // Card variations
  card: theme.glass.primary,
  cardElevated: theme.glass.elevated, 
  cardTerminal: theme.glass.terminal,
  cardMinimal: "bg-transparent border border-white/20 transition-all duration-200 hover:bg-white/5 hover:border-white/30",

  // Text hierarchy with enhanced font weights
  heading: `${theme.text.primary} ${theme.typography.displayLarge}`,
  headingLarge: `${theme.text.primary} ${theme.typography.displayLarge}`,
  headingMedium: `${theme.text.primary} ${theme.typography.heading}`,
  subheading: `${theme.text.secondary} ${theme.typography.subheading}`,
  body: `${theme.text.tertiary} ${theme.typography.body}`,
  caption: `${theme.text.quaternary} ${theme.typography.caption}`,
  fine: `${theme.text.quaternary} ${theme.typography.fine} text-xs`,

  // Interactive elements
  buttonPrimary: theme.button.primary,
  buttonSecondary: theme.button.secondary,
  buttonOutline: theme.button.outline,
  
  // Form elements with dark theme styling
  input: "backdrop-blur-xl bg-white/5 border border-white/10 text-white placeholder-white/50 px-4 py-3 rounded-xl text-base focus:border-white/30 focus:ring-2 focus:ring-white/20 focus:bg-white/10 transition-all duration-200",
  
  // Layout utilities
  section: "py-20 px-6",
  sectionSubtle: `py-20 px-6 ${theme.background.section}`,
  hero: `pt-20 pb-32 px-6 ${theme.background.hero}`,
  
  // Modal overlay
  modalOverlay: theme.background.modal,
};
