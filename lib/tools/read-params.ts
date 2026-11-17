import { Type } from 'typebox';
import {
  READ_DEFAULT_MAX_CHARS,
  READ_MAX_MAX_CHARS,
  READ_MIN_MAX_CHARS,
  type ReadMode,
} from '@/lib/page/reader';

const modeSchema = Type.Union(
  [Type.Literal('markdown'), Type.Literal('article'), Type.Literal('text'), Type.Literal('html')],
  {
    description:
      '"markdown"（默认）：整页转 Markdown，标题、链接、图片都保留，链接是绝对地址，任何页面都能用。' +
      '"article"：用阅读模式抽出正文，去掉导航、侧栏和广告，适合新闻、博客、长文档。' +
      '"text"：只要纯文本。' +
      '"html"：清洗后的 HTML 源码，用来排查页面为什么读不到内容。',
  },
);

const selectorSchema = Type.Optional(
  Type.String({
    description:
      '只读页面里匹配这个 CSS 选择器的区域，省略则读整页。article 模式下省略 selector 才会走正文识别。' +
      '选择器写错会明确报错，按报错改正即可。',
    maxLength: 500,
  }),
);

const maxLengthSchema = Type.Optional(
  Type.Number({
    description:
      `返回内容的最大字符数，默认 ${READ_DEFAULT_MAX_CHARS}，范围 ${READ_MIN_MAX_CHARS}～${READ_MAX_MAX_CHARS}。` +
      '看到截断提示时，把上限调大并在一次调用里重读，不要换选择器反复调用拼接结果。',
    minimum: READ_MIN_MAX_CHARS,
    maximum: READ_MAX_MAX_CHARS,
  }),
);

const frameIdSchema = Type.Optional(
  Type.Number({
    description:
      '要读取的子框架 id，默认 0（顶层页面）。结果里出现「页面里还有子框架」时，用那里列出的 frame_id 再读一次。' +
      'frame_id 在页面刷新或跳转后会变，不要跨页面复用。',
    minimum: 0,
  }),
);

export const readExtractionParameters = {
  mode: Type.Optional(modeSchema),
  selector: selectorSchema,
  max_length: maxLengthSchema,
  frame_id: frameIdSchema,
};

export interface ReadExtractionParams {
  mode?: ReadMode;
  selector?: string;
  max_length?: number;
  frame_id?: number;
}
