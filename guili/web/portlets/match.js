
Portlet.register('match', 'Match', class extends Portlet {

  async init(options) {
    await super.init(options);

    this.tbody = this.content.querySelector('tbody');
    this.timer = this.tbody.querySelector('th');

    this.updateRobots(gs.robots);

    gevents.addHandlerFor(this, 'robots', (robots) => {
      this.updateRobots(robots);
    });

    this.bindFrame(null, 'tm_match_timer', (frame) => {
      this.updateTimer(frame.args.seconds);
    });
  }

  updateTimer(t) {
    this.timer.textContent = t + ' s';
  }

  updateRobots(robots) {
    while (this.tbody.children.length > 1) {
      this.tbody.removeChild(this.tbody.lastChild);
    }
    for (const r of robots) {
      const tr = document.createElement('tr');
      const td_r = document.createElement('td');
      td_r.textContent = r;
      tr.appendChild(td_r);
      this.tbody.appendChild(tr);
    }
  }

});

