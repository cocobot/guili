
Portlet.register('asserv', 'Asserv', class extends Portlet {

  async init(options) {
    await super.init(options);
    //TODO Update the menu when `gs.robots` changes
    this.setRobotViewMenu(gs.robots, this.setRobot.bind(this));
    this.setRobot(options.robot ? options.robot : gs.robots[0]);

    const tr_field = this.content.querySelector('table tr:last-of-type');
    gevents.addHandlerFor(this, 'field-point-xy', (x, y) => {
      const tds = tr_field.querySelectorAll('td');
      tds[0].textContent = x.toFixedHtml(0);
      tds[1].textContent = y.toFixedHtml(0);
    });
  }

  setRobot(robot) {
    this.unbindFrame();
    this.robot = robot;
    if (!robot) {
      this.content.querySelector('div.portlet-title').textContent = `Asserv`;
      return;
    }
    const table = this.content.querySelector('table');
    this.content.querySelector('div.portlet-title').textContent = `Asserv › ${robot}`;
    table.dataset.robotCategory = robotCategory(robot);
    const [tr_position, tr_speed, tr_carrot, tr_order, tr_wheels, tr_field] = table.querySelectorAll('tr');

    this.bindFrame(robot, 'MatchTm', (frame) => {
      const args = frame.args;
      const tds = tr_field.querySelectorAll('td');
      tds[2].textContent = (args.time_ms / 1000).toFixed(0) + ' s';
    });
    this.bindFrame(robot, 'AsservTmStatus', (frame) => {
      const args = frame.args;
      const tds = tr_position.querySelectorAll('td');
      tds[0].textContent = args.x.toFixedHtml(0);
      tds[1].textContent = args.y.toFixedHtml(0);
      tds[2].textContent = args.a.toFixedHtml(2);
      // Note: `args.idle` is not used
    });
    this.bindFrame(robot, 'AsservTmSpeed', (frame) => {
      const args = frame.args;
      const tds = tr_speed.querySelectorAll('td');
      tds[0].textContent = args.vx.toFixedHtml(0);
      tds[1].textContent = args.vy.toFixedHtml(0);
      tds[2].textContent = args.va.toFixedHtml(2);
    });
    this.bindFrame(robot, 'AsservHoloTmStatus', (frame) => {
      const args = frame.args;
      {
        const tds = tr_carrot.querySelectorAll('td');
        tds[0].textContent = args.carrot_x.toFixedHtml(0);
        tds[1].textContent = args.carrot_y.toFixedHtml(0);
        tds[2].textContent = args.carrot_a.toFixedHtml(2);
      }
      {
        const tds = tr_order.querySelectorAll('td');
        tds[0].textContent = {idle: '-', path: 'P', autoset: 'A'}[args.status] || '?';
        if (args.status !== 'path') {
          tds[1].textContent = '-';
          tds[2].textContent = '-';
        }
      }
    });
    this.bindFrame(robot, 'AsservHoloTmPath', (frame) => {
      const args = frame.args;
      const tds = tr_order.querySelectorAll('td');
      tds[1].textContent = args.carrot_speed;
      tds[2].textContent = `${args.path_index} / ${args.path_size}`;
    });
    this.bindFrame(robot, 'AsservDiffTmStatus', (frame) => {
      // Note: status is not displayed
      const args = frame.args;
      const tds = tr_wheels.querySelectorAll('td');
      tds[0].textContent = args.dist.toFixedHtml(0);
      tds[1].textContent = args.vdist.toFixedHtml(0);
      tds[2].textContent = args.va.toFixedHtml(2);
    });
  }

  getOptions() {
    return Object.assign(super.getOptions(), {
      robot: this.robot,
    });
  }

});

