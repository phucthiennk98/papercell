import {
  BaseFootnoteDefinitionPlugin,
  BaseFootnoteReferencePlugin,
} from '@platejs/footnote';
import { MarkdownPlugin, remarkMdx, remarkMention } from '@platejs/markdown';
import { KEYS } from 'platejs';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

export const MarkdownKit = [
  BaseFootnoteReferencePlugin,
  BaseFootnoteDefinitionPlugin,
  MarkdownPlugin.configure({
    options: {
      plainMarks: [KEYS.suggestion, KEYS.comment],
      remarkPlugins: [
        remarkMath,
        remarkGfm,
        remarkEmoji as any,
        remarkMdx,
        remarkMention,
      ],
      rules: {
        figure: {
          serialize: (node: any) => ({
            type: 'code',
            lang: 'papercell-figure',
            value: JSON.stringify({
              caption: node.caption ?? '',
              ...(node.spec ? { spec: node.spec } : {}),
              params: node.params ?? [],
              js: node.js ?? '',
              ...(node.python ? { python: node.python } : {}),
            }),
          }),
        },
      },
    },
  }),
];
