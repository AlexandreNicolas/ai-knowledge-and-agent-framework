import { MessageEvent, Controller, Get, Post, Body, Patch, Param, Delete, Sse } from '@nestjs/common';
import { CheesecakeService } from './cheesecake.service';
import { concatMap, delayWhen, map, timer } from 'rxjs';

import { CreateCheesecakeDto } from './dto/create-cheesecake.dto';
import { UpdateCheesecakeDto } from './dto/update-cheesecake.dto';
import { AskCheesecakeDto } from './dto/ask-cheesecake.dto';

@Controller('cheesecake')
export class CheesecakeController {
  constructor(private readonly cheesecakeService: CheesecakeService) { }

  /**
   * SSE stream: POST so EventSource works. Each token is sent as a separate event.
   */
  @Post('ask/stream')
  @Sse()
  askStream(@Body() askCheesecakeDto: AskCheesecakeDto) {
    return this.cheesecakeService.askStream(askCheesecakeDto).pipe(
      concatMap((event: MessageEvent) =>
        timer(0).pipe(
          delayWhen(() => {
            const text = String(event.data);
            let baseDelay = 40;
            if (text === ' ') baseDelay = 80;
            else if (/[.,!?;:]/.test(text)) baseDelay = 120;
            return timer(baseDelay + Math.random() * 10);
          }),
          map(() => ({ data: event.data })),
        ),
      ),
    );
  }

  @Post()
  create(@Body() createCheesecakeDto: CreateCheesecakeDto) {
    return this.cheesecakeService.create(createCheesecakeDto);
  }

  @Get()
  findAll() {
    return this.cheesecakeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.cheesecakeService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCheesecakeDto: UpdateCheesecakeDto) {
    return this.cheesecakeService.update(+id, updateCheesecakeDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.cheesecakeService.remove(+id);
  }
}
