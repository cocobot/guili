
Portlet.register('meca', 'Meca', class extends Portlet {

  async init(options) {
    await super.init(options);

    const trs = this.content.querySelectorAll('tr');
    const ROWS = 5;  // Rows per module/side

    const SIDES = ['left', 'right', 'back'];
    const ORDERS = ['MecaPrepareTake', 'MecaTake', 'MecaPrepareRelease', 'MecaRelease'];
    for (let side = 0; side < SIDES.length; ++side) {
      let buttons = trs[side * ROWS + 4].querySelectorAll('button');
      for (let order = 0; order < ORDERS.length; ++order) {
        buttons[order].onclick = () => gs.sendRomeFrame('galipeur', ORDERS[order], side);
      }
    }

    this.bindFrame(null, 'MecaArmTmState', (frame) => {
      const args = frame.args;

      trs[args.module * ROWS].querySelectorAll('td')[args.arm].textContent = args.position.toFixedHtml(0);
      trs[args.module * ROWS + 1].querySelectorAll('td')[args.arm].textContent = (args.pump ? "P" : "-") + (args.valve ? "V" : "-");

      let td_move = trs[args.module * ROWS + 2].querySelectorAll('td')[args.arm];
      td_move.firstChild.style.color = args.servo_error ? 'red' : 'black';
      td_move.firstChild.className = args.moving ? 'fa fa-circle-check' : 'fa fa-circle-play';

      let td_color = trs[args.module * ROWS + 3].querySelectorAll('td')[args.arm];
      td_color.firstChild.style.color = (args.color == 'yellow' || args.color == 'blue') ? args.color : 'grey';
    });

    this.bindFrame(null, 'MecaArmTmTranslation', (frame) => {
      const args = frame.args;
      trs[args.module * ROWS].querySelector('th').textContent = args.position.toFixedHtml(0);
    });
  }
});

