import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'
import { computed, effectScope, nextTick, ref, watch } from 'vue'

const readSource = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')
const panel = readSource('src/renderer/src/panels/MultiTargetPanel.vue')
const script = panel.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]

// Execute the actual panel functions, with reactive state and deterministic character data.
function extractFunctions(source, names) {
  const ast = ts.createSourceFile('source.ts', source, ts.ScriptTarget.Latest, true)
  const functions = ast.statements.filter(
    (node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text)
  )
  assert.equal(functions.length, names.length)
  return ts.transpile(
    functions.map((node) => node.getText(ast).replace(/^export /, '')).join('\n'),
    { target: ts.ScriptTarget.ES2022 }
  )
}

const functions =
  extractFunctions(script, [
    'setCurrentMove',
    'syncTargetBonuses',
    'ensureTargetData',
    'getCreature',
    'setBatchCritLimit',
    'normalizedCritLimit',
    'normalizedCustomDamage',
    'computeResult'
  ]) +
  extractFunctions(readSource('src/renderer/src/model/Damage.ts'), ['damageCalcRaw']) +
  extractFunctions(readSource('src/renderer/src/model/GlobalMemory.ts'), ['dicePct'])

function fixture(t) {
  const move = {
    name: 'skill-A',
    costPP: 15,
    elemType: '火',
    castAbility: '智力',
    powerList: [
      {
        idx: 1,
        power: 50,
        elemType: '火',
        aspect: '无性相',
        psType: '特殊',
        isStatus: false,
        extra: ''
      }
    ]
  }
  const creature = (code, autoCrit = false) => ({
    code: () => code,
    name: () => code,
    grandStatus: () => ({ autoCrit, grandMdf: 0 }),
    getAttributeByName: () => 100,
    typeMdf: () => 0,
    evasion: () => 0,
    attackDamageAfterToughness: (damage) => damage
  })
  const newMemory = () => ({
    ctLimit: 20,
    diceroll: 10,
    rollHistory: [10],
    enableAccuracyAdvance: 1
  })
  const ctx = {
    memory: ref({
      ...newMemory(),
      attackType: 1,
      attacker: { code: () => 'caster', battleLv: () => 100, accuracy: () => 0 }
    }),
    memoryHeal: ref(newMemory()),
    memoryStatus: ref(newMemory()),
    movem: ref({ targetCodes: ['A'], lastMoveName: '', selectedPowerIdx: 0, dmControlRoll: false }),
    targets: ref([]),
    batchAdvantage: ref(0),
    batchDamageMdfD: ref(0),
    batchDicerollD: ref(0),
    Creatures: ref([creature('A'), creature('B'), creature('C'), creature('crit', true)]),
    resolutionSelectionKey: ref(''),
    statusMode: ref('damage'),
    healMode: ref('heal'),
    currentMove: () => move,
    currentPower: () => move.powerList[0],
    customPowerEnabled: () => false,
    isNoPowerPlaceholder: (power) => power.idx === 0,
    damageTypeList: ['火', '水', '无属性'],
    damageAttackList: ['物攻', '特攻'],
    modifierList: ['智力'],
    envTypeMdfTotal: () => 0,
    spellModifier: () => 0,
    getAttackAdvantage: () => 0,
    battleLv: () => 100,
    spellAttack: () => 200,
    spellTypeStab: () => 0
  }
  ctx.atkType = computed(() => ctx.memory.value.attackType)
  vm.createContext(ctx)
  vm.runInContext(`let lastTargetRollSettings = null;\n${functions}`, ctx)
  const scope = effectScope()
  scope.run(() => {
    watch(() => [...ctx.movem.value.targetCodes].sort().join('\0'), ctx.ensureTargetData, {
      immediate: true
    })
    watch(ctx.atkType, ctx.ensureTargetData)
  })
  t.after(() => scope.stop())
  ctx.setCurrentMove()
  return { ctx, move }
}

function setRoll(entry, diceroll = 18, ctLimit = 17, history = [5, 18]) {
  entry.diceroll = diceroll
  entry.ctLimit = ctLimit
  entry.rollHistory = [...history]
}

function assertRoll(entry, diceroll = 18, ctLimit = 17, history = [5, 18]) {
  assert.equal(entry.diceroll, diceroll)
  assert.equal(entry.ctLimit, ctLimit)
  assert.deepEqual(Array.from(entry.rollHistory), history)
}

test('switching skills and powers preserves critical thresholds, rolls, history and damage', async (t) => {
  const { ctx, move } = fixture(t)
  ctx.setBatchCritLimit(17)
  setRoll(ctx.targets.value[0])
  ctx.memory.value.diceroll = 18
  ctx.memory.value.rollHistory = [5, 18]
  assert.equal(ctx.computeResult(ctx.targets.value[0]).damage, 140)
  for (const [name, idx] of [
    ['skill-B', 1],
    ['skill-B', 2]
  ]) {
    move.name = name
    move.powerList[0].idx = idx
    ctx.setCurrentMove()
    await nextTick()
    assertRoll(ctx.targets.value[0])
    assert.equal(ctx.memory.value.ctLimit, 17)
    assert.equal(ctx.memory.value.diceroll, 18)
    assert.deepEqual(Array.from(ctx.memory.value.rollHistory), [5, 18])
    assert.equal(ctx.computeResult(ctx.targets.value[0]).damage, 140)
  }
})

test('replacing targets, clearing all targets, and selecting again preserve roll settings', async (t) => {
  const { ctx } = fixture(t)
  setRoll(ctx.targets.value[0])
  for (const codes of [['B'], [], ['C'], ['A'], ['crit']]) {
    ctx.movem.value.targetCodes = codes
    await nextTick()
    if (codes.length) assertRoll(ctx.targets.value[0])
  }
  ctx.ensureTargetData()
  assertRoll(ctx.targets.value[0])
})

test('multiple targets keep independent rolls and thresholds across skill and target changes', async (t) => {
  const { ctx, move } = fixture(t)
  setRoll(ctx.targets.value[0])
  ctx.movem.value.targetCodes.push('B')
  await nextTick()
  assertRoll(ctx.targets.value[1])
  setRoll(ctx.targets.value[1], 14, 12, [14, 3])
  move.name = 'skill-B'
  ctx.setCurrentMove()
  await nextTick()
  assertRoll(ctx.targets.value[0])
  assertRoll(ctx.targets.value[1], 14, 12, [14, 3])
  ctx.movem.value.targetCodes = ['A', 'C']
  await nextTick()
  assertRoll(ctx.targets.value[0])
  assertRoll(ctx.targets.value[1], 14, 12, [14, 3])
  ctx.targets.value[1].rollHistory.push(7)
  assertRoll(ctx.targets.value[0])
})

test('public critical threshold follows attack, healing and status modes, including an empty target list', async (t) => {
  const { ctx, move } = fixture(t)
  setRoll(ctx.targets.value[0])
  ctx.setBatchCritLimit(17)
  for (const [elemType, isStatus] of [
    ['治疗', false],
    ['护盾', false],
    ['火', true],
    ['火', false]
  ]) {
    Object.assign(move.powerList[0], { elemType, isStatus })
    ctx.setCurrentMove()
    await nextTick()
    assertRoll(ctx.targets.value[0])
    for (const memory of [ctx.memory, ctx.memoryHeal, ctx.memoryStatus])
      assert.equal(memory.value.ctLimit, 17)
  }
  ctx.movem.value.targetCodes = []
  await nextTick()
  ctx.setBatchCritLimit(13)
  ctx.movem.value.targetCodes = ['B']
  await nextTick()
  assertRoll(ctx.targets.value[0], 18, 13)
})

test('DM-controlled rolls and automatic-critical targets are not overwritten by selection changes', async (t) => {
  const { ctx, move } = fixture(t)
  ctx.movem.value.dmControlRoll = true
  setRoll(ctx.targets.value[0], 7, 16, [7])
  ctx.movem.value.targetCodes = ['crit']
  await nextTick()
  ctx.movem.value.dmControlRoll = false
  move.name = 'skill-B'
  ctx.setCurrentMove()
  await nextTick()
  assertRoll(ctx.targets.value[0], 7, 16, [7])
})

test('retained public bonuses still reach target calculations on skill changes', async (t) => {
  const { ctx, move } = fixture(t)
  ctx.batchDamageMdfD.value = -1
  ctx.batchDicerollD.value = 4
  ctx.batchAdvantage.value = 2
  setRoll(ctx.targets.value[0])
  move.name = 'skill-B'
  ctx.setCurrentMove()
  await nextTick()
  const entry = ctx.targets.value[0]
  assertRoll(entry)
  assert.equal(entry.damageMdfD, -1)
  assert.equal(entry.dicerollD, 4)
  assert.equal(entry.advantageDelta, 2)
  assert.equal(ctx.computeResult(entry).damage, 106)
})
