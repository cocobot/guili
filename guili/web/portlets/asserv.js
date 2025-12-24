
Portlet.register('asserv', 'Asserv', class extends Portlet {

  async init(options) {
    await super.init(options);
    this.setRobotViewMenu(gs.robots, this.setRobot.bind(this));
    this.setRobot(options.robot ? options.robot : gs.robots[0]);

    gevents.addHandlerFor(this, 'field-point-xy', (x, y) => {
      const tds = this.content.querySelectorAll('td');
      tds[6].textContent = x.toFixedHtml(0);
      tds[7].textContent = y.toFixedHtml(0);
    });
  }

  setRobot(robot) {
    this.unbindFrame();
    this.robot = robot;
    if(robot) {
      this.content.querySelector('div.portlet-title').textContent = "Asserv › "+robot;
    }

    this.bindFrame(robot, 'AsservTelemetry', (frame) => {
      const args = frame.args;
      const tds = this.content.querySelectorAll('td');
      tds[0].textContent = args.x.toFixedHtml(0);
      tds[1].textContent = args.y.toFixedHtml(0);
      tds[2].textContent = args.a.toFixedHtml(2);
    });
    this.bindFrame(robot, 'AsservTmCarrot', (frame) => {
      const args = frame.args;
      const tds = this.content.querySelectorAll('td');
      tds[3].textContent = args.x.toFixedHtml(0);
      tds[4].textContent = args.y.toFixedHtml(0);
    });
    //TODO Update message names
    this.bindFrame(robot, 'asserv_tm_htraj_done', (frame) => {
      const args = frame.args;
      const tds = this.content.querySelectorAll('td');
      tds[0].classList.toggle('portlet-asserv-done', args.xy);
      tds[1].classList.toggle('portlet-asserv-done', args.xy);
      tds[2].classList.toggle('portlet-asserv-done', args.a);
    });
    this.bindFrame(robot, 'asserv_tm_htraj_path_index', (frame) => {
      const args = frame.args;
      const tds = this.content.querySelectorAll('td');
      tds[5].textContent = args.i + " / " + args.size;
    });
    this.bindFrame(robot, 'tm_match_timer', (frame) => {
      const args = frame.args;
      const tds = this.content.querySelectorAll('td');
      tds[8].textContent = args.seconds + 's';
    });
  }

  getOptions() {
    return Object.assign(super.getOptions(), {
      robot: this.robot,
    });
  }

});

