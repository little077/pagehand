import { describe, expect, it } from 'vitest';
import {
  confirmationFor,
  highRiskOf,
  isMutatingAction,
  isSearchTarget,
} from '@/lib/agent/action-safety';

const target = (label: string, role: string | null = 'button', tag = 'button') => ({
  ref: 'e1',
  tag,
  role,
  label,
  selector: 'body > button',
});

describe('interact 安全判断', () => {
  it('识别支付、删除、发布等高风险按钮', () => {
    expect(highRiskOf(target('立即支付')).risky).toBe(true);
    expect(highRiskOf(target('删除账户')).term).toBe('删除');
    expect(highRiskOf(target('发布笔记')).risky).toBe(true);
    expect(highRiskOf(target('提交')).risky).toBe(true);
    expect(highRiskOf(target('Submit', 'button', 'button')).risky).toBe(true);
    expect(highRiskOf(target('Delete account', 'button', 'button')).risky).toBe(true);
  });

  it('普通操作不误报', () => {
    expect(highRiskOf(target('搜索')).risky).toBe(false);
    expect(highRiskOf(target('下一页', 'link', 'a')).risky).toBe(false);
    expect(highRiskOf(target('取消')).risky).toBe(false);
  });

  it('页面正文里的风险词不算，只有可操作控件才算', () => {
    expect(highRiskOf(target('删除账户', null, 'div')).risky).toBe(false);
    expect(highRiskOf({ ...target('删除账户'), role: 'heading', tag: 'h1' }).risky).toBe(false);
    expect(highRiskOf({ ...target('删除账户', null, 'span'), risk_label: '删除账户' }).risky).toBe(
      true,
    );
    expect(highRiskOf(null).risky).toBe(false);
  });

  it('搜索框回车是低风险，普通输入框回车需要确认', () => {
    expect(isSearchTarget(target('搜索', 'searchbox', 'input'))).toBe(true);
    expect(isSearchTarget(target('search', 'textbox', 'input'))).toBe(true);
    expect(isSearchTarget(target('搜索', 'button', 'button'))).toBe(true);
    expect(
      isSearchTarget({
        ...target('杭州百丈岭', 'textbox', 'textarea'),
        name: 'aiSearchTextarea',
      }),
    ).toBe(true);
    expect(isSearchTarget(target('输入消息', 'textbox', 'textarea'))).toBe(false);
    expect(isSearchTarget(null)).toBe(false);
  });

  it('scroll 和 wait_for 不需要站点授权，其余写操作需要', () => {
    expect(isMutatingAction('scroll')).toBe(false);
    expect(isMutatingAction('wait_for')).toBe(false);
    expect(isMutatingAction('click')).toBe(true);
    expect(isMutatingAction('fill')).toBe(true);
    expect(isMutatingAction('hover')).toBe(true);
  });
});

describe('interact 高风险确认策略', () => {
  it('支付按钮、普通表单提交都要确认，搜索提交不确认', () => {
    expect(confirmationFor('click', target('立即支付'))).toMatchObject({
      required: true,
      detail: '命中「支付」',
    });
    expect(
      confirmationFor('click', {
        ...target('登录'),
        submits_form: true,
      }),
    ).toMatchObject({ required: true, detail: '点击会提交表单' });
    expect(
      confirmationFor('click', {
        ...target('搜索'),
        submits_form: true,
      }).required,
    ).toBe(false);
    expect(confirmationFor('click', target('下一页', 'link', 'a')).required).toBe(false);
    expect(
      confirmationFor('click', {
        ...target('Go', null, 'span'),
        risk_label: '登录',
        risk_submits_form: true,
      }),
    ).toMatchObject({ required: true, detail: '点击会提交表单' });
  });

  it('普通输入框回车要确认，搜索框回车和 Escape 不确认', () => {
    expect(
      confirmationFor('press', target('输入消息', 'textbox', 'textarea'), { key: 'Enter' }),
    ).toMatchObject({
      required: true,
      detail: '回车可能提交表单或发送消息',
    });
    expect(
      confirmationFor('press', target('搜索', 'searchbox', 'input'), { key: 'Enter' }).required,
    ).toBe(false);
    expect(confirmationFor('press', target('输入消息'), { key: 'Escape' }).required).toBe(false);
    expect(
      confirmationFor(
        'press',
        { ...target('杭州百丈岭', 'textbox', 'textarea'), name: 'aiSearchTextarea' },
        { key: 'Enter' },
      ).required,
    ).toBe(false);
  });

  it('选择高风险选项、勾选授权项都要确认', () => {
    expect(
      confirmationFor('select', target('操作', 'combobox', 'select'), { option: '永久删除' })
        .required,
    ).toBe(true);
    expect(
      confirmationFor('select', target('城市', 'combobox', 'select'), { option: '西安' }).required,
    ).toBe(false);
    expect(confirmationFor('check', target('允许授权', 'checkbox', 'input')).required).toBe(true);
    expect(confirmationFor('check', target('记住我', 'checkbox', 'input')).required).toBe(false);
  });

  it('填写本身不触发确认，提交按钮会触发', () => {
    expect(confirmationFor('fill', target('支付金额', 'textbox', 'input')).required).toBe(false);
  });
});
