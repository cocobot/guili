
Portlet.register('meca', 'Meca', class extends Portlet {

  async init(options) {
    await super.init(options);

    const SIDE_NAMES = ['left', 'right', 'back'];

    const trs = this.content.querySelectorAll('tr');
    const elements = [];
    for (let side = 0; side < 3; ++side) {
      const index = side * 5;
      const positionTds = trs[index].querySelectorAll('td');
      const actuatorTds = trs[index + 1].querySelectorAll('td');
      const moveTds = trs[index + 2].querySelectorAll('td');
      const colorTds = trs[index + 3].querySelectorAll('td');
      const buttons = trs[index + 4].querySelectorAll('button');

      const arms = [];
      for (let arm = 0; arm < 3; ++arm) {
        arms.push({
          positionText: positionTds[arm],
          actuatorText: actuatorTds[arm],
          moveIcon: moveTds[arm].firstChild,
          colorIcon: colorTds[arm].firstChild,
        });
      }

      elements.push({
        arms,
        modulePositionText: trs[index].querySelector('th'),
        buttons: {
          'MecaPrepareTake': buttons[0],
          'MecaTake': buttons[1],
          'MecaPrepareRelease': buttons[2],
          'MecaRelease': buttons[3],
        },
      })
    }

    for (let side of elements) {
      for (const order in side.buttons) {
        side.buttons[order].onclick = () => gs.sendRomeFrame('galipeur', order, { side: SIDE_NAMES[side] });
      }
    }

    this.bindFrame(null, 'MecaTmArmFullState', (frame) => {
      const args = frame.args;
      const arm = elements[args.side].arms[args.arm];
      arm.positionText.textContent = args.position.toFixedHtml(0);
      arm.actuatorText.textContent = (args.pump ? "P" : "-") + (args.valve ? "V" : "-");
      arm.moveIcon.style.color = args.servo_error ? 'red' : 'black';
      arm.moveIcon.className = args.moving ? 'fa fa-circle-check' : 'fa fa-circle-play';
      arm.colorIcon.style.color = (args.color == 'yellow' || args.color == 'blue') ? args.color : 'grey';
    });

    this.bindFrame(null, 'MecaTmSideTranslation', (frame) => {
      const args = frame.args;
      elements[args.side].modulePositionText.textContent = args.position.toFixedHtml(0);
    });
  }
});

