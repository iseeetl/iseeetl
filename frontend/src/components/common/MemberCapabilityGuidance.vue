<template>
  <div class="member-guidance" data-testid="member-capability-guidance">
    <section v-for="section in sections" :key="section.title">
      <h3>{{ section.title }}</h3>
      <ul>
        <li v-for="item in section.items" :key="item">{{ item }}</li>
      </ul>
    </section>
    <p v-for="note in notes" :key="note" class="member-guidance-note">{{ note }}</p>
  </div>
</template>

<script>
const CAPABILITY_KEYS = {
  floor: {
    allowed: ['browse', 'rooms', 'resources', 'members', 'roomMembers', 'timeline'],
    denied: ['floor', 'resources', 'members'],
  },
  room: {
    allowed: ['entry', 'timeline', 'members'],
    denied: ['settings', 'resources', 'members', 'othersContent'],
  },
};

export default {
  name: 'MemberCapabilityGuidance',
  props: {
    scope: {
      type: String,
      required: true,
      validator: (value) => ['floor', 'room'].includes(value),
    },
  },
  computed: {
    sections() {
      return Object.entries(CAPABILITY_KEYS[this.scope]).map(([group, items]) => ({
        title: this.$t(`memberCapabilities.${group}`),
        items: items.map((key) => this.$t(`${this.scope}MemberDialogs.capabilities.${group}.${key}`)),
      }));
    },
    notes() {
      return [
        ...(this.scope === 'floor' ? [this.$t('floorMemberDialogs.capabilities.creatorNote')] : []),
        this.$t('memberCapabilities.roleNote'),
      ];
    },
  },
};
</script>

<style scoped>
.member-guidance {
  margin: 16px 0 0;
  padding: 12px 16px;
  padding-inline-start: 20px;
  line-height: 1.6;
}

.member-guidance section + section {
  margin-top: 16px;
}
.member-guidance h3 {
  margin: 0 0 6px;
  font-size: 15px;
  font-weight: 600;
}
.member-guidance ul {
  margin: 0;
  padding-inline-start: 22px;
  list-style: disc;
}
.member-guidance li + li {
  margin-top: 4px;
}
.member-guidance-note {
  margin: 12px 0 0;
  font-size: 13px;
}
.member-guidance {
  overflow-wrap: anywhere;
}
</style>
