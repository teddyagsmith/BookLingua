/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#7B6CA8',
          dark: '#5E5090',
          light: '#EBE6F4',
        },
        cream: '#F7EFE4',
      },
      fontFamily: {
        serif: ["'EB Garamond'", 'Georgia', 'serif'],
      },
      typography: {
        DEFAULT: {
          css: {
            '--tw-prose-headings':      '#1A1A1A',
            '--tw-prose-links':         '#7B6CA8',
            '--tw-prose-bold':          '#1A1A1A',
            '--tw-prose-bullets':       '#7B6CA8',
            '--tw-prose-counters':      '#7B6CA8',
            '--tw-prose-quotes':        '#4A3F6B',
            '--tw-prose-quote-borders': '#7B6CA8',
            '--tw-prose-hr':            '#E8E0D8',
            maxWidth: '68ch',
            h1: {
              fontFamily: '"EB Garamond", Georgia, serif',
              fontWeight: '500',
              fontSize:   '2.25rem',
              lineHeight: '1.2',
              marginBottom: '0.5rem',
            },
            h2: {
              fontFamily:    '"EB Garamond", Georgia, serif',
              fontWeight:    '500',
              fontSize:      '1.65rem',
              lineHeight:    '1.3',
              marginTop:     '2.5rem',
              marginBottom:  '0.5rem',
              paddingBottom: '0.25rem',
              borderBottom:  '1px solid #E8E0D8',
            },
            h3: {
              fontFamily:   'Inter, system-ui, sans-serif',
              fontWeight:   '600',
              fontSize:     '1.35rem',
              color:        '#7B6CA8',
              marginTop:    '1.75rem',
              marginBottom: '0.4rem',
            },
            h4: {
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: '600',
              fontSize:   '1.15rem',
              color:      '#3A3A3A',
              marginTop:  '1.25rem',
            },
            p: {
              lineHeight:    '1.75',
              marginBottom:  '1rem',
              color:         '#3A3A3A',
            },
            li: {
              marginBottom:  '0.35rem',
              lineHeight:    '1.6',
            },
            blockquote: {
              borderLeftColor:  '#7B6CA8',
              borderLeftWidth:  '3px',
              backgroundColor:  '#F7EFE4',
              borderRadius:     '0 6px 6px 0',
              padding:          '0.75rem 1.25rem',
              fontStyle:        'normal',
              color:            '#3A3A3A',
            },
            'blockquote p': {
              marginBottom: '0',
              marginTop:    '0',
            },
            a: {
              color:               '#7B6CA8',
              textDecoration:      'underline',
              textDecorationColor: '#C4B5D9',
              fontWeight:          '500',
            },
            'a:hover': {
              color:               '#4A3F6B',
              textDecorationColor: '#7B6CA8',
            },
            'ul > li::marker': {
              color: '#7B6CA8',
            },
            'ol > li::marker': {
              color:      '#7B6CA8',
              fontWeight: '600',
            },
            strong: {
              fontWeight: '600',
              color:      '#1A1A1A',
            },
            hr: {
              borderColor:   '#E8E0D8',
              marginTop:     '2.5rem',
              marginBottom:  '2.5rem',
            },
            code: {
              backgroundColor: '#F0ECF8',
              borderRadius:    '3px',
              padding:         '0.1em 0.35em',
              color:           '#4A3F6B',
              fontSize:        '0.875em',
            },
          },
        },
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
