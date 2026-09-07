import { describe, it, expect } from 'vitest';
import { validateDeployment, isInDeployZone, DEFAULT_DEPLOYMENT_RULES } from '../../src/core/deployment';
import type { RosterEntry } from '../../src/core/deployment';
import { DEPLOY_ZONE, PLAYER_UNITS } from '../../src/config/map';

const entry = (templateId: string, q: number, r: number): RosterEntry => ({
  templateId,
  position: { q, r }
});

describe('deployment', () => {
  describe('isInDeployZone', () => {
    it('部署区边界内返回 true（含边界）', () => {
      expect(isInDeployZone({ q: 0, r: 26 }, DEPLOY_ZONE)).toBe(true);
      expect(isInDeployZone({ q: 19, r: 29 }, DEPLOY_ZONE)).toBe(true);
      expect(isInDeployZone({ q: 10, r: 27 }, DEPLOY_ZONE)).toBe(true);
    });

    it('部署区边界外返回 false', () => {
      expect(isInDeployZone({ q: 0, r: 25 }, DEPLOY_ZONE)).toBe(false);
      expect(isInDeployZone({ q: 20, r: 26 }, DEPLOY_ZONE)).toBe(false);
    });
  });

  describe('validateDeployment', () => {
    it('默认 PLAYER_UNITS 按默认规则通过校验', () => {
      const result = validateDeployment(PLAYER_UNITS, DEPLOY_ZONE);
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('站位在部署区外被拒', () => {
      const r = validateDeployment([entry('lord', 10, 25)], DEPLOY_ZONE);
      expect(r.ok).toBe(false);
      expect(r.errors.some(e => e.includes('部署区外'))).toBe(true);

      const q = validateDeployment([entry('lord', 20, 27)], DEPLOY_ZONE);
      expect(q.ok).toBe(false);
      expect(q.errors.some(e => e.includes('部署区外'))).toBe(true);
    });

    it('站位重叠被拒', () => {
      const r = validateDeployment(
        [entry('lord', 10, 27), entry('knight', 10, 27)],
        DEPLOY_ZONE
      );
      expect(r.ok).toBe(false);
      expect(r.errors.some(e => e.includes('重叠'))).toBe(true);
    });

    it('人数超上限被拒', () => {
      const entries: RosterEntry[] = PLAYER_UNITS.map(u => ({
        templateId: u.templateId,
        position: u.position
      }));
      entries.push(entry('lord', 3, 29));
      const r = validateDeployment(entries, DEPLOY_ZONE);
      expect(r.ok).toBe(false);
      expect(r.errors.some(e => e.includes('人数超限'))).toBe(true);
    });

    it('人数低于下限被拒', () => {
      const r = validateDeployment([], DEPLOY_ZONE);
      expect(r.ok).toBe(false);
      expect(r.errors.some(e => e.includes('人数不足'))).toBe(true);
    });

    it('未知模板被拒', () => {
      const r = validateDeployment([entry('ghost', 10, 27)], DEPLOY_ZONE);
      expect(r.ok).toBe(false);
      expect(r.errors.some(e => e.includes('未知模板'))).toBe(true);
    });

    it('敌方模板被拒', () => {
      const r = validateDeployment([entry('swordsman', 10, 27)], DEPLOY_ZONE);
      expect(r.ok).toBe(false);
      expect(r.errors.some(e => e.includes('非我方模板'))).toBe(true);
    });

    it('重复模板被拒', () => {
      const r = validateDeployment(
        [entry('lord', 10, 27), entry('lord', 11, 27)],
        DEPLOY_ZONE
      );
      expect(r.ok).toBe(false);
      expect(r.errors.some(e => e.includes('重复'))).toBe(true);
    });

    it('领主约束（默认开）：编成缺少领主被拒', () => {
      const noLord = PLAYER_UNITS.filter(u => u.templateId !== 'lord');
      const r = validateDeployment(noLord, DEPLOY_ZONE);
      expect(r.ok).toBe(false);
      expect(r.errors.some(e => e.includes('lord'))).toBe(true);
      expect(DEFAULT_DEPLOYMENT_RULES.requiredTemplateIds).toContain('lord');
    });

    it('领主约束（参数关闭）：无领主编成可通过', () => {
      const noLord = PLAYER_UNITS.filter(u => u.templateId !== 'lord');
      const r = validateDeployment(noLord, DEPLOY_ZONE, {
        minUnits: 1,
        maxUnits: 10,
        requiredTemplateIds: []
      });
      expect(r.ok).toBe(true);
    });

    it('自定义规则参数生效（minUnits=3）', () => {
      const two = [entry('lord', 10, 27), entry('knight', 11, 27)];
      const r = validateDeployment(two, DEPLOY_ZONE, {
        minUnits: 3,
        maxUnits: 10,
        requiredTemplateIds: ['lord']
      });
      expect(r.ok).toBe(false);
      expect(r.errors.some(e => e.includes('人数不足'))).toBe(true);
    });

    it('自定义部署区生效（缩小后默认站位出区）', () => {
      const tightZone = { qMin: 8, qMax: 12, rMin: 27, rMax: 29 };
      const outOfTight = PLAYER_UNITS.filter(u => u.position.q < 8);
      expect(outOfTight.length).toBeGreaterThan(0);
      const r = validateDeployment(outOfTight, tightZone);
      expect(r.ok).toBe(false);
      expect(r.errors.some(e => e.includes('部署区外'))).toBe(true);
    });
  });
});
