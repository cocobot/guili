
Portlet.register('meca', 'Meca', class extends Portlet {

  async init(options) {
    await super.init(options);

    this.fullTable = this.content.querySelector('table.meca-full');
    this.defaultTable = this.content.querySelector('table.meca-default');

    this.displayMode = options.mode == 'full' ? 'full' : 'default';
    this.setDisplayMode(this.displayMode);

    // Add eye icon to toggle display mode
    const modeIcon = createElementFromHtml('<i class="far fa-eye" />');
    this.header.insertBefore(modeIcon, this.header.childNodes[0]);
    modeIcon.addEventListener('click', () => {
      const mode = this.displayMode == 'default' ? 'full' : 'default';
      gs.sendRomeFrame('galipeur', 'MecaSetTmLevel', [mode]);
      this.setDisplayMode(mode);
    });

    const SIDE_NAMES = ['left', 'right', 'back'];

    // Full
    {
      const trs = this.fullTable.querySelectorAll('tr');
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

    // Default
    {
      const trs = this.defaultTable.querySelectorAll('tr');
      const elements = [];
      for (let side = 0; side < 3; ++side) {
        elements.push({
          ready: trs[side * 2 + 1].querySelector('td').firstChild,
          upper: Array.from(trs[side * 2].querySelectorAll('td').values().map(td => td.firstChild)),
          lower: Array.from(trs[side * 2 + 1].querySelectorAll('td').values().map(td => td.firstChild)).splice(1),
        });
      }

      this.bindFrame(null, 'MecaTmSideState', (frame) => {
        const args = frame.args;
        const elems = elements[args.side];
        elems.ready.style.color = args.ready_to_take ? 'green' : 'red';
        for (let i = 0; i < 4; ++i) {
          const upper = args.upper_stage[i];
          const lower = args.lower_stage[i];
          elems.upper[i].style.color = (upper == 'yellow' || upper == 'blue') ? upper : 'grey';
          elems.lower[i].style.color = (lower == 'yellow' || lower == 'blue') ? lower : 'grey';
        }
      });
    }
  }

  getOptions() {
    return Object.assign(super.getOptions(), {
      mode: this.displayMode,
    });
  }

  // Set mode ('full' or 'default'), update display but don't send order to galipeur
  setDisplayMode(mode) {
    this.displayMode = mode;
    if (mode == 'full') {
      this.fullTable.style.display = '';
      this.defaultTable.style.display = 'none';
    } else {
      this.fullTable.style.display = 'none';
      this.defaultTable.style.display = '';
    }
  }
});

