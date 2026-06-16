/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Coinbase Design System Colors
        'coinbase-blue': 'var(--color-coinbase-blue)',
        'coinbase-blue-active': 'var(--color-coinbase-blue-active)',
        'coinbase-blue-disabled': 'var(--color-coinbase-blue-disabled)',
        'accent-yellow': 'var(--color-accent-yellow)',
        
        // Surface Colors
        'canvas': 'var(--color-canvas)',
        'surface-soft': 'var(--color-surface-soft)',
        'surface-strong': 'var(--color-surface-strong)',
        'surface-dark': 'var(--color-surface-dark)',
        'surface-dark-elevated': 'var(--color-surface-dark-elevated)',
        
        // Hairlines
        'hairline': 'var(--color-hairline)',
        'hairline-soft': 'var(--color-surface-strong)',
        
        // Text Colors
        'ink': 'var(--color-ink)',
        'body': 'var(--color-body)',
        'body-strong': 'var(--color-ink)',
        'muted': 'var(--color-muted)',
        'muted-soft': 'var(--color-on-dark-soft)',
        'on-primary': 'var(--color-on-primary)',
        'on-dark': 'var(--color-on-dark)',
        'on-dark-soft': 'var(--color-on-dark-soft)',
        
        // Trading Semantics
        'semantic-up': 'var(--color-semantic-up)',
        'semantic-down': 'var(--color-semantic-down)',
        
        // Map default Tailwind colors to Coinbase colors
        background: 'var(--color-canvas)',
        foreground: 'var(--color-ink)',
        primary: 'var(--color-coinbase-blue)',
        'primary-foreground': 'var(--color-on-primary)',
        secondary: 'var(--color-surface-strong)',
        'secondary-foreground': 'var(--color-ink)',
        accent: 'var(--color-surface-soft)',
        'accent-foreground': 'var(--color-ink)',
        destructive: 'var(--color-semantic-down)',
        'destructive-foreground': 'var(--color-on-primary)',
        muted: 'var(--color-muted)',
        'muted-foreground': 'var(--color-muted)',
        card: 'var(--color-canvas)',
        'card-foreground': 'var(--color-ink)',
        border: 'var(--color-hairline)',
        ring: 'var(--color-coinbase-blue)',
      },
      fontFamily: {
        'display': ['Inter', 'Noto Sans SC', '-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        'sans': ['Inter', 'Noto Sans SC', '-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Geist Mono', 'Consolas', 'Monaco', 'monospace'],
      },
      fontSize: {
        'display-mega': ['80px', { lineHeight: '1', letterSpacing: '0', fontWeight: '500' }],
        'display-xl': ['64px', { lineHeight: '1', letterSpacing: '0', fontWeight: '500' }],
        'display-lg': ['52px', { lineHeight: '1', letterSpacing: '0', fontWeight: '500' }],
        'display-md': ['44px', { lineHeight: '1.09', letterSpacing: '0', fontWeight: '500' }],
        'display-sm': ['36px', { lineHeight: '1.11', letterSpacing: '0', fontWeight: '500' }],
        'title-lg': ['32px', { lineHeight: '1.13', letterSpacing: '0', fontWeight: '500' }],
        'title-md': ['18px', { lineHeight: '1.33', letterSpacing: '0', fontWeight: '600' }],
        'title-sm': ['16px', { lineHeight: '1.25', letterSpacing: '0', fontWeight: '600' }],
        'body-md': ['16px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
        'caption': ['13px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
        'number-display': ['18px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '500' }],
        'button': ['16px', { lineHeight: '1.15', letterSpacing: '0', fontWeight: '600' }],
        'nav-link': ['14px', { lineHeight: '1.4', letterSpacing: '0', fontWeight: '500' }],
      },
      spacing: {
        'xxs': '4px',
        'xs': '8px',
        'sm': '12px',
        'base': '16px',
        'md': '20px',
        'lg': '24px',
        'xl': '32px',
        'xxl': '48px',
        'section': '96px',
      },
      borderRadius: {
        'none': '0px',
        'xs': '4px',
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
        'pill': '100px',
        'full': '9999px',
      },
      boxShadow: {
        'soft': 'var(--shadow-soft)',
      },
    },
  },
  plugins: [],
}
