<script setup lang="ts">
import pkg from '../../../../package.json'

const repositoryUrl = 'https://github.com/windaoist/PMDnD-Calculator'
const licenseUrl = `${repositoryUrl}/blob/main/LICENSE`
</script>

<template>
  <div class="about-panel">
    <div class="about-copy">
      <h3>PMDnD计算器</h3>
      <div class="version">版本 {{ pkg.version }}</div>

      <dl class="about-details">
        <div>
          <dt>作者</dt>
          <dd>全体PMDnD贡献者</dd>
        </div>
        <div>
          <dt>GitHub</dt>
          <dd>
            <a :href="repositoryUrl" target="_blank" rel="noreferrer">{{ repositoryUrl }}</a>
          </dd>
        </div>
        <div>
          <dt>许可证</dt>
          <dd>
            <a :href="licenseUrl" target="_blank" rel="noreferrer">AGPL-3.0</a>
          </dd>
        </div>
      </dl>
    </div>
  </div>
</template>

<style scoped>
.about-panel {
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
  padding: 0.5em;
  display: flex;
  align-items: center;
  justify-content: center;
}

.about-copy {
  width: min(100%, 34em);
  padding: 1em;
}

.about-copy h3 {
  margin-top: 0;
  margin-bottom: 0.3em;
}

.version {
  color: #666;
}

.about-details {
  margin: 1.25em 0 0;
}

.about-details > div {
  display: grid;
  grid-template-columns: 4.5em minmax(0, 1fr);
  gap: 0.75em;
  padding: 0.55em 0;
  border-top: 1px solid #ddd;
}

.about-details dt {
  font-weight: 600;
}

.about-details dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}

.about-details a {
  color: #1565c0;
}
</style>
