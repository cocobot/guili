
Portlet.register('meca', 'Meca', class extends Portlet {

  async init(options) {
    await super.init(options);

    this.bindFrame(null, 'MecaArmTmState', (frame) => {
      const args = frame.args;
      const trs = this.content.querySelectorAll('tr');

      trs[args.module * 4].querySelectorAll('td')[args.arm].textContent = args.position.toFixedHtml(0);
      trs[args.module * 4 + 1].querySelectorAll('td')[args.arm].textContent = (args.pump ? "P" : "-") + (args.valve ? "V" : "-");

      let td_move = trs[args.module * 4 + 2].querySelectorAll('td')[args.arm];
      td_move.firstChild.style.color = args.servo_error ? 'red' : 'black';
      td_move.firstChild.className = args.moving ? 'fa fa-circle-check' : 'fa fa-circle-play';

      let td_color = trs[args.module * 4 + 3].querySelectorAll('td')[args.arm];
      td_color.firstChild.style.color = (args.color == 'yellow' || args.color == 'blue') ? args.color : 'grey';
    });

    this.bindFrame(null, 'MecaArmTmTranslation', (frame) => {
      const args = frame.args;
      const trs = this.content.querySelectorAll('tr');
      trs[args.module * 4].querySelector('th').textContent = args.position.toFixedHtml(0);
    });
  }
});

