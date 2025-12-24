
Portlet.register('meca', 'Meca', class extends Portlet {

  async init(options) {
    await super.init(options);

    var state_to_color = {
      busy: 'red',
      ready: 'green',
      ground_clear: 'orange',
    };

    this.bindFrame(null, 'meca_tm_state', (frame) => {
      const td = this.content.querySelector('td');
      td.firstChild.style.color = state_to_color[frame.args.state];
      console.log(td.firstChild.style.color);
    });

    this.bindFrame(null, 'meca_tm_arms_state', (frame) => {
      const args = frame.args;
      const tds = this.content.querySelectorAll('td');

      tds[1].textContent = args.l_pos < 0 ? '✗' : args.l_pos.toFixedHtml(0);
      for(var i = 0; i < 3; i++) {
        tds[2+i].firstChild.style.color = args.l_atoms[i] ? 'black' : 'gray';
      }

      tds[5].textContent = args.r_pos < 0 ? '?' : args.r_pos.toFixedHtml(0);
      for(var i = 0; i < 3; i++) {
        tds[6+i].firstChild.style.color = args.r_atoms[i] ? 'black' : 'gray';
      }
    });
  }
});

